'use strict';

function inherit(parent,child={},overrides={}){
 const inherited={
  directory:parent?.directory??child.directory,
  workspaceID:parent?.workspaceID??parent?.workspaceId??child.workspaceID,
  projectID:parent?.projectID??parent?.projectId??child.projectID,
  provider:parent?.provider??child.provider,
  model:overrides.model??child.model??parent?.model,
  permissions:mergePermissions(parent?.permissions||parent?.permission,child?.permissions||child?.permission,overrides.permissions),
  contextEpoch:parent?.contextEpoch??0,
  parentSessionID:parent?.id??parent?.sessionID??null,
 };
 return {...child,...inherited,...overrides,permissions:inherited.permissions};
}
function mergePermissions(...sets){
 const out={};
 for(const set of sets){
  if(!set)continue;
  if(Array.isArray(set)){
   for(const rule of set){const key=rule?.permission||rule?.tool||rule?.name;if(key)out[key]=rule;}
  }else Object.assign(out,set);
 }
 return out;
}
function validate(parent,child){
 const mismatches=[];
 for(const key of ['directory','workspaceID','projectID'])if(parent?.[key]!=null&&child?.[key]!==parent[key])mismatches.push(key);
 return {valid:mismatches.length===0,mismatches};
}
module.exports={inherit,mergePermissions,validate};
