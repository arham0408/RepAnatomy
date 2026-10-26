import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSearchConcepts,findMuscleConcept} from '../app/anatomy-search.ts';
const atlas=JSON.parse(readFileSync(new URL('../public/models/atlas.json',import.meta.url),'utf8'));
const concepts=buildSearchConcepts(atlas);
test('fitness muscle links select muscle groups, never similarly named vessels',()=>{
  for(const name of ['deltoid','pectoralis major','biceps brachii','gluteus maximus','Quadriceps','triceps brachii','brachialis']){
    const chosen=findMuscleConcept(atlas,concepts,name);
    assert.ok(chosen,name);
    assert.ok(chosen.elements.every(id=>atlas.parts.find(p=>p.id===id)?.system==='muscular'),name);
  }
  assert.equal(findMuscleConcept(atlas,concepts,'deltoid').name,'zone of deltoid');
  assert.equal(findMuscleConcept(atlas,concepts,'Quadriceps').elements.length,8);
});
