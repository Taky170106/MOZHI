export type Turn = {
  id: string
  dir: 'in' | 'out'
  at: string
  text: string
  glosses: string[]
  conf?: number
  repeated?: boolean
  textOnly?: boolean
  fresh?: boolean
}

export const SEED_TURNS: Turn[] = [
  { id: 's9', dir: 'out', at: '09:16 AM', text: 'That is not a problem, your appointment is still open.', glosses: ['NO', 'BAD', 'APPOINTMENT', 'OPEN'] },
  { id: 's8', dir: 'in', at: '09:15 AM', text: 'The morning train was delayed.', glosses: ['MORNING', 'TRAIN', 'DELAY'], conf: 0.92 },
  { id: 's7', dir: 'out', at: '09:42 AM', text: 'Come tomorrow morning for the report.', glosses: ['TOMORROW', 'MORNING', 'REPORT', 'COME'] },
  { id: 's6', dir: 'in', at: '09:41 AM', text: 'When will the test report be ready?', glosses: ['TEST', 'REPORT', 'WHEN'], conf: 0.81, repeated: true },
  { id: 's5', dir: 'out', at: '10:53 AM', text: 'The pharmacy is room number 2.', glosses: ['MEDICINE', 'ROOM', 'NUMBER'], textOnly: true },
  { id: 's4', dir: 'in', at: '10:52 AM', text: 'My head hurts.', glosses: ['MY', 'HEAD', 'PAIN'], conf: 0.89 },
  { id: 's3', dir: 'out', at: '11:25 AM', text: 'Please wait, the doctor will see you shortly.', glosses: ['PLEASE', 'WAIT', 'DOCTOR', 'SEE', 'YOU'] },
  { id: 's2', dir: 'in', at: '11:24 AM', text: 'I need to see a doctor soon.', glosses: ['DOCTOR', 'SEE', 'NEED'], conf: 0.94 },
  { id: 's1', dir: 'out', at: '06:22 PM', text: 'Go to room number 2.', glosses: ['ROOM', 'NUMBER', 'GO'] },
]
