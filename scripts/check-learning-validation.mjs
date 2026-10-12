import {readFile} from 'node:fs/promises';
import {isolatedModules} from './isolated-modules.mjs';
const file=process.argv[2];if(!file)throw Error('Usage: node scripts/check-learning-validation.mjs observations.json');
const input=JSON.parse(await readFile(file,'utf8'));
const env=await isolatedModules(['learningValidation']);
const {assessLearningValidation}=await env.load('learningValidation');
console.log(JSON.stringify(assessLearningValidation(input),null,2));
