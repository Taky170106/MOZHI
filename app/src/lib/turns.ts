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
  { id: 's9', dir: 'out', at: '09:16 AM', text: 'Come tomorrow morning.', glosses: ['TOMORROW', 'MORNING', 'COME'] },
  { id: 's8', dir: 'in', at: '09:15 AM', text: 'My ID card is lost.', glosses: ['MY', 'CARD', 'LOST'], conf: 0.9 },
  { id: 's7', dir: 'out', at: '09:42 AM', text: 'Please sign the complaint.', glosses: ['PLEASE', 'COMPLAINT', 'SIGNATURE'] },
  { id: 's6', dir: 'in', at: '09:41 AM', text: 'What is the token number?', glosses: ['TOKEN', 'NUMBER', 'WHAT'], conf: 0.81, repeated: true },
  { id: 's5', dir: 'out', at: '10:53 AM', text: 'Please go to the window.', glosses: ['PLEASE', 'WINDOW', 'GO'] },
  { id: 's4', dir: 'in', at: '10:52 AM', text: 'My phone was stolen.', glosses: ['MY', 'PHONE', 'THEFT'], conf: 0.89 },
  { id: 's3', dir: 'out', at: '11:25 AM', text: 'Please wait for an officer.', glosses: ['PLEASE', 'OFFICER', 'WAIT'] },
  { id: 's2', dir: 'in', at: '11:24 AM', text: 'I need to file a complaint.', glosses: ['COMPLAINT', 'NEED'], conf: 0.94 },
  { id: 's1', dir: 'out', at: '06:22 PM', text: 'Do you need help?', glosses: ['YOU', 'HELP', 'NEED'] },
]
