'use strict';

function cleanLine(value){
  return String(value||'').replace(/\s+/g,' ').trim();
}

function truncateLine(line,maxChars){
  const value=cleanLine(line);
  if(value.length<=maxChars) return value;
  if(maxChars<=1) return value.slice(0,maxChars);
  return value.slice(0,maxChars-1)+'…';
}

function expandStateLines(stateText){
  const expanded=[];
  for(const raw of String(stateText||'').split('\n')){
    const line=cleanLine(raw);
    if(!line||line==='### Working state') continue;
    const match=line.match(/^-\s*([a-z_]+):\s*(.*)$/i);
    if(!match){expanded.push(line);continue;}
    const label=match[1];
    const facts=match[2].split(/\s+;\s+/).map(cleanLine).filter(Boolean);
    if(!facts.length){expanded.push(line);continue;}
    for(const fact of facts) expanded.push(`- ${label}: ${fact}`);
  }
  return expanded;
}

function statePriority(line){
  const lower=String(line||'').toLowerCase();
  if(lower.includes('blockers:')) return 100;
  if(lower.includes('constraints:')) return 90;
  if(lower.includes('failed_attempts:')) return 80;
  if(lower.includes('pending:')) return 75;
  if(lower.includes('implementation:')) return 60;
  if(lower.includes('resolved:')) return 20;
  return 50;
}

function addLine(state,line,{prefix='',minimum=24}={}){
  const raw=prefix+cleanLine(line);
  if(!raw.trim()) return false;
  const remaining=state.budget-state.used;
  if(remaining<minimum) return false;
  const fitted=truncateLine(raw,remaining);
  state.lines.push(fitted);
  state.used+=fitted.length+1;
  return true;
}

function packSummary({stateText='',anchors=[],excerpts=[]}={},budget=2400){
  const max=Math.max(0,Number(budget)||0);
  if(max<80) return '';
  const out={budget:max,used:0,lines:[]};

  const stateLines=expandStateLines(stateText)
    .sort((a,b)=>statePriority(b)-statePriority(a));

  if(stateLines.length){
    addLine(out,'### Working state',{minimum:18});
    for(const line of stateLines) addLine(out,line,{minimum:30});
  }

  const uniqueAnchors=[...new Set((anchors||[]).map(cleanLine).filter(Boolean))];
  if(uniqueAnchors.length&&out.budget-out.used>80){
    addLine(out,'### Key historical anchors',{minimum:24});
    for(const anchor of uniqueAnchors){
      if(!addLine(out,anchor,{prefix:'- ',minimum:36})) break;
    }
  }

  const cleanExcerpts=(excerpts||[]).map(cleanLine).filter(Boolean);
  if(cleanExcerpts.length&&out.budget-out.used>100){
    addLine(out,'### Recent compacted excerpts',{minimum:24});
    for(let i=cleanExcerpts.length-1;i>=0;i--){
      if(!addLine(out,cleanExcerpts[i],{prefix:'- ',minimum:40})) break;
    }
  }

  return out.lines.join('\n').slice(0,max);
}

function unpackStats(text){
  const value=String(text||'');
  return {
    chars:value.length,
    hasState:value.includes('### Working state'),
    hasAnchors:value.includes('### Key historical anchors'),
    hasExcerpts:value.includes('### Recent compacted excerpts'),
    lines:value?value.split('\n').length:0,
  };
}

module.exports={cleanLine,truncateLine,expandStateLines,statePriority,packSummary,unpackStats};
