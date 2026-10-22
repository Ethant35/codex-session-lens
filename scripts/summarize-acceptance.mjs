import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const inputs=process.argv.slice(2);
if(!inputs.length)throw new Error('Pass local Playwright JSON report paths.');
const runs=[];
for(const path of inputs){
 const report=JSON.parse(await readFile(path,'utf8'));
 const cases=[];
 const visit=s=>{for(const spec of s.specs||[])for(const test of spec.tests||[])cases.push({name:spec.title,status:test.results.at(-1)?.status,durationMs:test.results.at(-1)?.duration});for(const child of s.suites||[])visit(child);};visit(report);
 if(!cases.length || cases.some(c=>c.status!=='passed') || report.errors?.length)throw new Error('Report did not pass: '+path);
 runs.push({report:path.split('/').at(-1),started:report.stats.startTime,durationMs:report.stats.duration,cases});
}
const summary={author:'Ethan',generatedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actions:'Intentionally disabled; all checks local',runs};
await mkdir('docs',{recursive:true});await writeFile('docs/acceptance-results.json',JSON.stringify(summary,null,2)+'\n');
console.log('Saved sanitized evidence for',runs.reduce((n,r)=>n+r.cases.length,0),'passing cases.');
