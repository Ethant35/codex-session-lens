import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launchLens, addSession, appendTokenCount } from './helpers';

test('SL-14 local ingestion makes no HTTP uploads; renderer cannot connect or access Node', async () => {
  const run = await launchLens();
  const netlog = join(run.root,'network.json');
  try {
    await run.app.evaluate(async ({netLog},path) => netLog.startLogging(path),netlog);
    const networkRequests: string[] = [];
    run.page.on('request', request => {if (/^https?:|^wss?:/.test(request.url())) networkRequests.push(request.method());});
    const file = await addSession(run.source,{id:'privacy-session',model:'gpt-6-luna'});
    await appendTokenCount(file,'privacy-session',{total:{input:900,output:90,cached:300},latest:{input:900,output:90,cached:300}});
    await run.page.getByTestId('session-privacy-session').click();
    await expect(run.page.getByTestId('total-input')).toHaveText('900');
    const node = await run.page.evaluate(() => typeof (window as any).require);
    expect(node).toBe('undefined');
    const security = await run.app.evaluate(({BrowserWindow}) => {const p=(BrowserWindow.getAllWindows()[0].webContents as any).getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};});
    expect(security).toEqual({sandbox:true,contextIsolation:true,nodeIntegration:false});
    // Observe another polling cycle while app is idle after ingesting.
    await expect.poll(async () => {
      const first = await run.page.evaluate(() => window.lens.snapshot());
      return first.diagnostics.lastScan;
    }).not.toBeNull();
    await run.app.evaluate(async ({netLog}) => netLog.stopLogging());
    const log=JSON.parse(await readFile(netlog,'utf8'));
    const eventNames = new Map<number,string>(Object.entries(log.constants.logEventTypes).map(([k,v])=>[v as number,k]));
    const outbound = log.events.filter((e:any) => /TCP_CONNECT|UDP_CONNECT|SOCKET_BYTES_SENT|HTTP_TRANSACTION_SEND_REQUEST|QUIC_SESSION_PACKET_SENT/.test(eventNames.get(e.type) || ''));
    expect(outbound).toEqual([]);
    expect(networkRequests).toEqual([]);
    const denied = await run.page.evaluate(async () => {try {await fetch('https://example.com/telemetry',{method:'POST',body:'synthetic-probe'});return false;}catch{return true;}});
    expect(denied).toBe(true);
    await run.page.getByRole('button',{name:'Settings',exact:true}).click();
    await run.page.getByRole('button',{name:'Clear telemetry',exact:true}).click();
    await run.page.getByRole('button',{name:'Confirm clear'}).click();
    await expect(run.page.getByText('No sessions found yet.')).toBeVisible();
    await expect(run.page.getByLabel('Pause ingestion')).toBeChecked();
    await mkdir('.local',{recursive:true});
    await writeFile('.local/privacy-evidence.json',JSON.stringify({author:'Ethan',timestamp:new Date().toISOString(),httpRequests:networkRequests.length,outboundNetlogEvents:outbound.length,cspProbeBlocked:denied,security},null,2));
  } finally {await run.close();}
});
