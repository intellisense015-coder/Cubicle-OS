/* Data contract: save this object against each proposal in your database. */
const defaults={proposal_number:'0210',date:'2026-09-23',seat_title:'4 seats',subtitle:'4 workstations, in configuration\nof a fully private office.',client_name:'Moiz Foods',office:'11',seats:4,rate:29500,discount:18200,selection:{x:76.9047,y:73.2135,width:10.833,height:8.923}};
const key='cubicle-proposal-demo-v1';
let data=structuredClone(defaults);
try{const saved=JSON.parse(localStorage.getItem(key));if(saved) data={...defaults,...saved,selection:{...defaults.selection,...saved.selection}};}catch{}
const form=document.querySelector('form'),selection=document.querySelector('#selection'),map=document.querySelector('#floor-map');
const money=n=>'PKR '+Math.round(n).toLocaleString('en-US');
function fit(el){const base=parseFloat(getComputedStyle(el).fontSize);el.style.fontSize='';let size=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>el.clientWidth+1 && size>6){size-=.25;el.style.fontSize=size+'px';}}
function text(name,value){const el=document.querySelector(`[data-field="${name}"]`);el.textContent=value;fit(el);}
function render(){
 const gross=Number(data.seats)*Number(data.rate),monthly=gross-Number(data.discount);
 const parts=data.date.split('-');const date=parts.length===3?`${parts[2]} ${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEPT','OCT','NOV','DEC'][Number(parts[1])-1]} ${parts[0]}`:'';
 text('proposal_heading',`PROPOSAL ${data.proposal_number} — ${date}`);text('seat_title',data.seat_title);text('subtitle1',data.subtitle);text('client_name',data.client_name);
 text('office_line',`Office- ${data.office} , ${data.seats} seats @ ${money(data.rate)} per seat`);text('gross',money(gross));text('discount','− '+money(data.discount));text('monthly',money(monthly));text('per_seat_note',`(@ ${money(monthly/data.seats)} per seat Exclusive of all applicable taxes)`);
 const s=data.selection;selection.style.left=s.x+'%';selection.style.top=s.y+'%';selection.style.width=s.width+'%';selection.style.height=s.height+'%';
 document.querySelector('#totals').textContent=`Gross: ${money(gross)} · Monthly: ${money(monthly)}`;
}
function save(){try{localStorage.setItem(key,JSON.stringify(data));}catch{}window.dispatchEvent(new CustomEvent('proposalchange',{detail:structuredClone(data)}));}
function populate(){for(const el of form.elements)if(el.name)el.value=data[el.name];render();}
form.addEventListener('submit',e=>e.preventDefault());
form.addEventListener('input',e=>{const el=e.target;if(!el.name)return;if(!el.checkValidity())return;const next={...data,[el.name]:el.type==='number'?Number(el.value):el.value};if(next.discount>next.seats*next.rate){document.querySelector('#status').textContent='Discount cannot exceed the gross amount.';return;}document.querySelector('#status').textContent='';data=next;render();save();});
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
let gesture=null;
map.addEventListener('pointerdown',e=>{e.preventDefault();const r=map.getBoundingClientRect();const p={x:(e.clientX-r.left)/r.width*100,y:(e.clientY-r.top)/r.height*100};
 if(e.target===map){data.selection.x=clamp(p.x-data.selection.width/2,0,100-data.selection.width);data.selection.y=clamp(p.y-data.selection.height/2,0,100-data.selection.height);render();save();return;}
 gesture={id:e.pointerId,start:p,original:{...data.selection},resize:e.target.id==='resize'};map.setPointerCapture(e.pointerId);});
map.addEventListener('pointermove',e=>{if(!gesture||gesture.id!==e.pointerId)return;const r=map.getBoundingClientRect(),dx=(e.clientX-r.left)/r.width*100-gesture.start.x,dy=(e.clientY-r.top)/r.height*100-gesture.start.y,s=data.selection,o=gesture.original;
 if(gesture.resize){s.width=clamp(o.width+dx,2,100-o.x);s.height=clamp(o.height+dy,2,100-o.y);}else{s.x=clamp(o.x+dx,0,100-s.width);s.y=clamp(o.y+dy,0,100-s.height);}render();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])map.addEventListener(event,()=>{if(gesture){gesture=null;save();}});
selection.addEventListener('keydown',e=>{const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!moves[e.key])return;e.preventDefault();const [dx,dy]=moves[e.key],s=data.selection;s.x=clamp(s.x+dx,0,100-s.width);s.y=clamp(s.y+dy,0,100-s.height);render();save();});
document.querySelector('#print').onclick=async()=>{await document.fonts.ready;render();window.print();};
document.querySelector('#download').onclick=async()=>{await document.fonts.ready;render();document.querySelector('#status').textContent='Use the print dialog to choose Save as PDF.';window.print();};
document.querySelector('#send').onclick=()=>{const link=window.parent!==window?window.parent.location.href:window.location.href;const message=`Proposal ${data.proposal_number} for ${data.client_name}: ${link}`;window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`,'_blank','noopener');window.location.href=`mailto:?subject=${encodeURIComponent(`Proposal ${data.proposal_number}`)}&body=${encodeURIComponent(message)}`;};
window.proposal={getData:()=>structuredClone(data),setData:value=>{const next={...defaults,...value,selection:{...defaults.selection,...value.selection}};if(!Number.isInteger(next.seats)||next.seats<1||!Number.isFinite(next.rate)||next.rate<0||!Number.isFinite(next.discount)||next.discount<0||next.discount>next.rate*next.seats)throw new Error('Invalid commercial values');for(const k of ['x','y','width','height'])if(!Number.isFinite(next.selection[k]))throw new Error('Invalid selection');next.selection.width=clamp(next.selection.width,2,100);next.selection.height=clamp(next.selection.height,2,100);next.selection.x=clamp(next.selection.x,0,100-next.selection.width);next.selection.y=clamp(next.selection.y,0,100-next.selection.height);data=next;populate();save();}};
populate();document.fonts.ready.then(render);
