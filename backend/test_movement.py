import os
import unittest
from unittest.mock import patch, AsyncMock
import httpx
from fastapi.testclient import TestClient
from backend.main import app
from backend import fitness as f
from backend.movement import joint_angles
from backend import test_fitness as fixtures
from backend.test_fitness import pose, jpeg


class MovementTests(unittest.TestCase):
    create = fixtures.FitnessTests.create
    send = fixtures.FitnessTests.send
    cycle = fixtures.FitnessTests.cycle

    def setUp(self):
        f.workouts.clear()
        self.client = TestClient(app)

    def test_temporal_recognition_all_five_and_next_cycle_count(self):
        for exercise in f.CATALOG:
            with self.subTest(exercise=exercise):
                token = self.create('auto')
                for i, degree in enumerate([170, 140, 90, 55, 55, 90, 140, 170] * 3):
                    points = pose(exercise, degree)
                    if exercise == 'lunge':
                        points[28]['x'] += .2
                    result = self.send(token, points, i * 250)
                self.assertTrue(result['recognition']['locked'], result)
                self.assertEqual(result['exercise'], exercise)
                self.assertGreaterEqual(result['reps'], 1)

    def test_static_pose_cannot_trigger_recognition_or_reps(self):
        token = self.create('auto')
        for i in range(35):
            result = self.send(token, pose('press', 90), i * 250)
        self.assertFalse(result['recognition']['locked'])
        self.assertEqual(result['reps'], 0)

    def test_occluded_dark_and_frontal_pose_abstain(self):
        for mode in ('occluded', 'dark', 'front'):
            token = self.create('auto')
            for i, degree in enumerate([170, 55, 90, 140] * 5):
                points = pose('curl', degree)
                if mode == 'occluded':
                    for p in points:
                        p['visibility'] = .2
                if mode == 'front':
                    points[12]['x'] += .2
                result = self.send(token, points, i * 250, image=jpeg(brightness=10) if mode == 'dark' else None)
            self.assertFalse(result['recognition']['locked'])
            self.assertEqual(result['reps'], 0)

    def test_telemetry_bilateral_angles_and_per_rep_range(self):
        token, result = self.cycle('curl')
        telemetry = self.client.get(f'/api/fitness/sessions/{token}/telemetry').json()
        self.assertEqual(len(telemetry['samples']), 7)
        self.assertEqual(len(telemetry['samples'][0]['angles']), 8)
        record = telemetry['rep_records'][0]
        self.assertAlmostEqual(record['angle_ranges']['left_elbow']['min'], 57.3, delta=.2)
        self.assertAlmostEqual(record['angle_ranges']['left_elbow']['max'], 172.3, delta=.2)
        self.assertEqual(record['duration_s'], 1.5)
        self.assertFalse(record['review'])

    def test_missing_joints_are_null_not_zero_degrees(self):
        points = [f.Landmark(**p) for p in pose('curl', 55)]
        points[13].visibility = .1
        angles = joint_angles(points, 640, 480)
        self.assertIsNone(angles['left_elbow'])
        self.assertAlmostEqual(angles['right_elbow'], 57.3, delta=.2)

    def test_local_goal_coaching_and_stop_override(self):
        with patch.dict(os.environ, {'GROQ_API_KEY': ''}):
            result = self.client.post('/api/fitness/coach', json={'message': 'Train shoulders'}).json()
            self.assertEqual(result['recommendations'], ['press'])
            self.assertEqual(result['provider'], 'local')
            pain = self.client.post('/api/fitness/coach', json={'message': 'My knee hurts'}).json()
            self.assertEqual(pain['recommendations'], [])

    def test_provider_receives_angles_not_images_and_failure_falls_back(self):
        token, _ = self.cycle('curl')
        reply = httpx.Response(200, json={'choices': [{'message': {'content': 'Your elbow range was 55 to 170 degrees. Keep your upper arm steady.'}}]}, request=httpx.Request('POST', 'https://example.test'))
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'}), patch('backend.fitness_coach.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=reply) as post:
            result = self.client.post('/api/fitness/coach', json={'message': 'Review my set', 'session_id': token}).json()
            self.assertEqual(result['provider'], 'configured_ai')
            payload = post.call_args.kwargs['json']['messages'][-1]['content']
            self.assertIn('left_elbow', payload)
            self.assertNotIn('data:image', payload)
        f.workouts[token].last_coach = 0
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'}), patch('backend.fitness_coach.httpx.AsyncClient.post', new_callable=AsyncMock, side_effect=httpx.ConnectError('offline')):
            result = self.client.post('/api/fitness/coach', json={'message': 'Review my set', 'session_id': token}).json()
            self.assertEqual(result['provider'], 'local_fallback')
            self.assertIn('1 observed reps', result['message'])

    def test_deleted_session_cannot_be_coached(self):
        token = self.create()
        self.client.delete(f'/api/fitness/sessions/{token}')
        self.assertEqual(self.client.post('/api/fitness/coach', json={'message': 'Review', 'session_id': token}).status_code, 404)

    def test_status_and_invalid_model_response_do_not_claim_live_success(self):
        with patch.dict(os.environ, {'GROQ_API_KEY': '', 'GROQ_MODEL': 'deepseek-r1-distill-llama-70b'}):
            status = self.client.get('/api/fitness/coach/status').json()
            self.assertFalse(status['configured'])
            self.assertFalse(status['connection_verified'])
            self.assertIn('retired', status['warning'])
        reply = httpx.Response(400, json={'error': {'message': 'model retired'}}, request=httpx.Request('POST', 'https://example.test'))
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'}), patch('backend.fitness_coach.httpx.AsyncClient.post', new_callable=AsyncMock, return_value=reply):
            result = self.client.post('/api/fitness/coach', json={'message': 'Train legs'}).json()
            self.assertEqual(result['provider'], 'local_fallback')
            self.assertIn('model ID', result['provider_error'])
            self.assertIn('Bodyweight squat', result['message'])

    def test_coach_rejects_oversized_message_and_preserves_clinical_gate(self):
        self.assertEqual(self.client.post('/api/fitness/coach', json={'message': 'x'*1201}).status_code, 422)
        with patch.dict(os.environ, {'GROQ_API_KEY': ''}):
            result = self.client.post('/api/fitness/coach', json={'message': 'Plan training', 'preferences': {'needs_clinical_review': True}}).json()
            self.assertEqual(result['recommendations'], [])

    def test_history_and_telemetry_are_bounded_and_invalid_frames_flagged(self):
        token, _ = self.cycle('curl')
        invalid = self.send(token, [], 2000)
        self.assertEqual(invalid['action'], 'reframe')
        record = f.workouts[token].samples[-1]
        self.assertFalse(record['valid'])
        self.assertTrue(all(v is None for v in record['angles'].values()))
        f.workouts[token].samples = [record] * 600
        self.send(token, [], 2250)
        self.assertEqual(len(f.workouts[token].samples), 600)

    def test_stop_during_provider_request_wins(self):
        token, _ = self.cycle('curl')
        async def delayed(*args, **kwargs):
            f.workouts[token].stopped = True
            return httpx.Response(200, json={'choices': [{'message': {'content': 'Continue exercising.'}}]}, request=httpx.Request('POST', 'https://example.test'))
        with patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'}), patch('backend.fitness_coach.httpx.AsyncClient.post', side_effect=delayed):
            result = self.client.post('/api/fitness/coach', json={'message': 'Review', 'session_id': token}).json()
            self.assertIn('Do not resume', result['message'])
            self.assertEqual(result['recommendations'], [])

    def test_recognition_evidence_does_not_cross_visibility_or_time_gaps(self):
        for interruption in ('hidden', 'gap'):
            token = self.create('auto')
            for i, degree in enumerate((170, 90, 55, 90, 55)):
                self.send(token, pose('curl', degree), i * 250)
            if interruption == 'hidden':
                self.send(token, [], 1250)
                timestamp = 1500
            else:
                timestamp = 5000
            result = self.send(token, pose('curl', 55), timestamp)
            self.assertFalse(result['recognition']['locked'])
            self.assertEqual(result['reps'], 0)

    def test_unrecognized_exercise_has_no_target_claim_or_practice_draft(self):
        token = self.create('auto')
        for i in range(3):
            result = self.send(token, pose(), i*250)
        self.assertEqual(result['expected_targets'], [])
        self.assertEqual(self.client.post(f'/api/fitness/sessions/{token}/plan', json={}).status_code,409)
        with patch.dict(os.environ, {'GROQ_API_KEY': ''}):
            answer=self.client.post('/api/fitness/coach',json={'session_id':token,'message':'Review my technique'}).json()
            self.assertIn('not recognized',answer['message'])
