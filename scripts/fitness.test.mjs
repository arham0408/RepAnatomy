import test from 'node:test';
import assert from 'node:assert/strict';
import {drawSkeleton} from '../app/fitness-demo.ts';
test('missing or incomplete detector observations render without crashing',()=>{
  const context={beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
  assert.doesNotThrow(()=>drawSkeleton(context,[],640,480));
  assert.doesNotThrow(()=>drawSkeleton(context,[{x:.5,y:.5,visibility:1}],640,480));
});
