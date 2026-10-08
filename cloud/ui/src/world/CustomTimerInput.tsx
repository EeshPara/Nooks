import { useEffect, useState } from 'react';

/** Keep incomplete edits local; only valid durations reach the timer. */
export function CustomTimerInput({minutes,disabled,onMinutes}:{minutes:number;disabled?:boolean;onMinutes:(minutes:number)=>void}) {
 const [draft,setDraft]=useState(String(minutes));
 useEffect(()=>setDraft(String(minutes)),[minutes]);
 return <input aria-label="Custom focus minutes" type="number" inputMode="numeric" min="1" max="180" value={draft} disabled={disabled}
  onChange={event=>{const value=event.target.value;setDraft(value);const number=Number(value);if(value!==''&&Number.isInteger(number)&&number>=1&&number<=180)onMinutes(number);}}
  onBlur={()=>{const number=Number(draft);const value=draft===''?minutes:Math.max(1,Math.min(180,Math.round(number)||minutes));setDraft(String(value));if(value!==minutes)onMinutes(value);}}/>;
}
