// Cria (ou recria) a tarefa "Lets Insights - newsletter semanal" no Agendador
// de Tarefas do Windows, via schtasks (o powershell.exe está bloqueado por
// política de grupo nesta máquina). Rodar UMA vez, no checkout principal
// (main), sem precisar de administrador:
//
//   node scripts/agendar-semana.js
//
// Janelas: segunda 06:00, 10:00 e 14:00 e terça 06:00. Se o computador estiver
// desligado na hora, a tarefa roda assim que ele for ligado (StartWhenAvailable).
// O rodar-semana.js marca cada etapa feita, então as janelas seguintes só
// continuam o que faltou ou saem sem fazer nada.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NOME = 'Lets Insights - newsletter semanal';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'rodar-semana.js');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const gatilho = (dia, hora) => `
    <CalendarTrigger>
      <StartBoundary>2026-11-23T${hora}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek><DaysOfWeek><${dia} /></DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>
    </CalendarTrigger>`;

const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Gera a Let's Insights da semana (WF-01, WF-02, WF-03) com a assinatura do Claude Code. Ver scripts/rodar-semana.js.</Description></RegistrationInfo>
  <Triggers>${gatilho('Monday', '06:00')}${gatilho('Monday', '10:00')}${gatilho('Monday', '14:00')}${gatilho('Tuesday', '06:00')}
  </Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${esc(process.execPath)}</Command>
      <Arguments>"${esc(SCRIPT)}"</Arguments>
      <WorkingDirectory>${esc(RAIZ)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;

const arq = path.join(os.tmpdir(), 'lets-insights-tarefa.xml');
// schtasks exige o XML em UTF-16 com BOM.
fs.writeFileSync(arq, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
const r = spawnSync('schtasks', ['/create', '/tn', NOME, '/xml', arq, '/f'], { encoding: 'utf8' });
fs.rmSync(arq, { force: true });
process.stdout.write(r.stdout || '');
process.stderr.write(r.stderr || '');
if (r.status === 0) console.log(`Tarefa criada. Para testar agora: schtasks /run /tn "${NOME}"`);
process.exitCode = r.status;
