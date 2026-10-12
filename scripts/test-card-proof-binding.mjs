import assert from 'node:assert/strict';
import {isolatedModules} from './isolated-modules.mjs';
const env=await isolatedModules(['contentReview']);
const {createCardReview,cardReviewIssues}=await env.load('contentReview');
const text=new Map([['doc:1','Pressure is 12 kPa when volume is fixed.']]);
const card={question:'What is the pressure at fixed volume?',answer:'12 kPa.',example:'',kind:'definition',evidence:[{documentId:'doc',page:1,quote:text.get('doc:1')}]};
card.accuracyReview=createCardReview(card,text);
assert.deepEqual(cardReviewIssues(card,text),[]);
for(const evidence of [
  [{...card.evidence[0],quote:'Pressure is 12 kPa'}],
  [{...card.evidence[0],quote:'',visualDescription:'A chart shows pressure at fixed volume.'}],
  [{...card.evidence[0],visualDescription:'A different interpretation of the image.'}],
])assert(cardReviewIssues({...card,evidence},text).length,'Changing supporting evidence must invalidate an earlier approval, even on the same page');
assert(cardReviewIssues({...card,answer:'120 kPa.'},text).length);
assert(cardReviewIssues(card,new Map([['doc:1','Pressure is 120 kPa when volume is fixed.']])).length);
console.log('PASS: accuracy approval bound to exact answer, quotations, visual descriptions and source text. Offline fixtures only.');
