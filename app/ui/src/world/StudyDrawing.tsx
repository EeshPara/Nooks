const positions={room:0,library:1,practice:2,garden:3,plan:4,sound:5,customize:6,bloom:7} as const;
export type StudyDrawingKind=keyof typeof positions;
export function StudyDrawing({kind,size=32}:{kind:StudyDrawingKind;size?:number}){const n=positions[kind];return <span className={`study-drawing drawing-${kind}`} aria-hidden="true" style={{width:size,height:size,backgroundPosition:`${(n%4)/3*100}% ${n<4?0:100}%`}}/>;}
