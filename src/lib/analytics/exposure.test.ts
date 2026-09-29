import assert from 'node:assert/strict';
import test from 'node:test';
import { exposure } from './exposure';

test('exposure starts after image load, pauses when hidden, and resets for a new photo', (t) => {
 t.mock.timers.enable({apis:['setTimeout']});
 let intersect: (entries: {intersectionRatio:number}[]) => void = () => {};
 let visibility = () => {};
 const doc = {visibilityState:'visible',addEventListener: (_:string,callback:()=>void)=>{visibility=callback;},removeEventListener:()=>{}};
 const oldDocument = globalThis.document, oldObserver = globalThis.IntersectionObserver;
 Object.assign(globalThis,{document:doc,IntersectionObserver:class {constructor(callback:typeof intersect){intersect=callback;}observe(){}disconnect(){}}});
 try {
  let calls=0;
  const onExpose=()=>{calls++;};
  const action=exposure({} as Element,{loaded:false,onExpose,identity:'one'});
  intersect([{intersectionRatio:1}]); t.mock.timers.tick(1500); assert.equal(calls,0);
  action.update({loaded:true,onExpose,identity:'one'}); t.mock.timers.tick(600);
  doc.visibilityState='hidden'; visibility(); t.mock.timers.tick(1000); assert.equal(calls,0);
  doc.visibilityState='visible'; visibility(); t.mock.timers.tick(1000); assert.equal(calls,1);
  action.update({loaded:true,onExpose,identity:'one'}); t.mock.timers.tick(1000); assert.equal(calls,1);
  action.update({loaded:true,onExpose,identity:'two'}); t.mock.timers.tick(1000); assert.equal(calls,2);
  action.destroy();
 } finally {Object.assign(globalThis,{document:oldDocument,IntersectionObserver:oldObserver});}
});
