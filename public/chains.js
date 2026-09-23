(function(root){
  // Q0 breaks a chain; Q1 and Q4 share the same compatibility group.
  function group(q){return q===1||q===4?14:q===2||q===3?q:0}
  function runs(values){
    const result=[];
    for(let start=0;start<values.length;){
      const key=group(values[start]);let end=start+1;
      while(end<values.length&&group(values[end])===key)end++;
      if(key&&end-start>=3)result.push({start,end,group:key});
      start=end;
    }
    return result;
  }
  function intervals(cycles,days){
    const edges=new Set([0,1]);
    cycles.forEach(c=>{if(c.fixed===undefined)for(let i=1;i<c.perDay*days;i++)edges.add(i/(c.perDay*days))});
    const points=[...edges].sort((a,b)=>a-b),rows=cycles.map(()=>[]);
    for(let i=0;i<points.length-1;i++){
      const left=points[i],right=points[i+1],x=(left+right)/2;
      const values=cycles.map(c=>c.fixed!==undefined?c.fixed:Math.floor(x*days*c.perDay)%4+1);
      for(const run of runs(values))for(let row=run.start;row<run.end;row++){
        const spans=rows[row],last=spans[spans.length-1];
        if(last&&last.right===left&&last.group===run.group)last.right=right;
        else spans.push({left,right,group:run.group});
      }
    }
    return rows;
  }
  const api={runs,intervals};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.QuarterChains=api;
})(typeof globalThis!=='undefined'?globalThis:this);
