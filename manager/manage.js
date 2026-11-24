(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let session, photos=[], revision=0, filter='all', editing=null, uploading=false, ordering=false, toastTimer;
  const dialog=$('edit-dialog');
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
  async function api(path,body){
    const options={credentials:'same-origin',cache:'no-store'};
    if(body!==undefined){options.method='POST';options.headers={'Content-Type':'application/json','X-Local-Token':session.token};options.body=JSON.stringify(body);}
    const response=await fetch(path,options);
    if(response.ok)return response.json();
    const result=await response.json().catch(()=>null);
    if((response.status===401&&path!=='/api/login')||(response.status===403&&body!==undefined)){
      await initialize();
      if(!session.authenticated){
        $('auth-error').textContent='登录状态已失效，请重新登录。';
        $('password').focus();
      }
    }
    const error=Error(result?.error||'操作未成功，请重试。');
    error.status=response.status;
    throw error;
  }
  async function initialize(){
    session=await api('/api/session');
    $('auth-panel').hidden=session.authenticated;
    $('workspace').hidden=!session.authenticated;
    $('export').hidden=$('logout').hidden=!session.authenticated;
    if(session.authenticated){await load();return;}
    if(dialog.open)dialog.close();
    const setup=session.setupRequired;
    $('auth-title').textContent=setup?'创建你的管理密码':'进入你的作品空间';
    $('auth-description').textContent=setup?'首次使用，请设置只属于你的管理密码。之后只有知道这个密码的人才能进入本地管理。':'使用管理密码登录，继续整理你的照片。';
    $('auth-submit').textContent=setup?'设置密码并进入':'登录管理';
    $('confirm-wrap').hidden=!setup;$('confirm-password').required=setup;
    $('password').autocomplete=setup?'new-password':'current-password';
    $('password').value='';$('confirm-password').value='';
    $('auth-error').textContent='';
  }
  $('auth-form').addEventListener('submit',async event=>{
    event.preventDefault();$('auth-error').textContent='';
    if(session.setupRequired&&$('password').value!==$('confirm-password').value){$('auth-error').textContent='两次输入的密码不一致。';return;}
    $('auth-submit').disabled=true;
    try{await api(session.setupRequired?'/api/setup':'/api/login',{password:$('password').value});await initialize();}
    catch(error){$('auth-error').textContent=error.message;}finally{$('auth-submit').disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{try{await api('/api/logout',{});await initialize();}catch(error){toast(error.message);}});
  async function load(){const result=await api('/api/library');photos=result.photos;revision=result.revision;$('storage-info').textContent='作品库保存在：'+result.storage;render();}
  function button(text,label,fn,className=''){const b=document.createElement('button');b.type='button';b.textContent=text;b.ariaLabel=label;b.className=className;b.addEventListener('click',fn);return b;}
  function listedPhotos(){
    const query=$('search').value.trim().toLocaleLowerCase();
    return photos.filter(p=>(filter==='trash'?p.archived:!p.archived)&&(filter!=='live'||p.visible)&&(filter!=='draft'||!p.visible)&&(!query||(p.title+' '+p.category+' '+p.caption).toLocaleLowerCase().includes(query)));
  }
  function render(){
    const active=photos.filter(p=>!p.archived);$('count-all').textContent=active.length;$('count-live').textContent=active.filter(p=>p.visible).length;
    const selected=listedPhotos();
    $('photo-library').replaceChildren();$('empty-state').hidden=selected.length>0;
    $('empty-title').textContent=filter==='trash'?'回收站是空的。':active.length?'这里还没有匹配的作品。':'第一张作品，从这里开始。';
    $('empty-copy').textContent=filter==='trash'?'移除的作品会保留在这里，可以恢复为草稿。':active.length?'试试其他筛选或搜索关键词。':'选择几张喜欢的照片，让主页拥有你的视角。';
    for(const [index,photo] of selected.entries()){
      const card=document.createElement('article');card.className='photo-card';
      const imageBox=document.createElement('div');imageBox.className='card-image';
      const image=document.createElement('img');image.src='/api/preview/'+photo.id;image.alt=photo.title;image.loading='lazy';
      const status=document.createElement('span');status.className='card-status'+(photo.visible&&!photo.archived?' live':'');status.textContent=photo.archived?'回收站':photo.visible?'主页展示':'草稿 / 隐藏';
      imageBox.append(image,status);const body=document.createElement('div');body.className='card-body';
      const title=document.createElement('h2');title.textContent=photo.title;title.title=photo.title;
      const category=document.createElement('p');category.className='card-category';category.textContent=photo.category;
      const actions=document.createElement('div');actions.className='card-actions';
      if(photo.archived){actions.append(button('恢复为草稿','恢复 '+photo.title,()=>action(photo.id,'restore'),'edit-button'));}
      else{
        actions.append(button('编辑','编辑 '+photo.title,()=>edit(photo),'edit-button'));
        const up=button('↑','上移 '+photo.title,()=>move(photo.id,-1));up.disabled=index===0;
        const down=button('↓','下移 '+photo.title,()=>move(photo.id,1));down.disabled=index===selected.length-1;
        actions.append(up,down,button('移除','移至回收站 '+photo.title,()=>action(photo.id,'archive'),'remove-button'));
      }
      body.append(title,category,actions);card.append(imageBox,body);$('photo-library').append(card);
    }
  }
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===b)));render();}));
  $('search').addEventListener('input',render);
  function edit(photo){editing=photo.id;$('edit-preview').src='/api/preview/'+photo.id;$('edit-title').value=photo.title;$('edit-caption').value=photo.caption;$('edit-category').value=photo.category;$('edit-visible').checked=photo.visible;$('edit-error').textContent='';dialog.showModal();}
  $('close-edit').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  $('edit-form').addEventListener('submit',async event=>{
    event.preventDefault();$('save-photo').disabled=true;$('edit-error').textContent='';
    try{await api('/api/photos/'+editing,{title:$('edit-title').value,caption:$('edit-caption').value,category:$('edit-category').value,visible:$('edit-visible').checked});dialog.close();await load();toast('作品已保存。预览摄影页可查看当前效果。');}
    catch(error){$('edit-error').textContent=error.message;}finally{$('save-photo').disabled=false;}
  });
  async function action(id,action){try{await api('/api/photos/'+id+'/'+action,{});await load();toast(action==='archive'?'已移到回收站，可随时恢复。':'已恢复为草稿。');}catch(error){toast(error.message);}}
  async function move(id,direction){
    if(ordering)return;
    const listed=listedPhotos();
    const index=listed.findIndex(photo=>photo.id===id);
    const neighbor=listed[index+direction];
    if(index<0||!neighbor)return;
    const ids=photos.filter(photo=>!photo.archived).map(photo=>photo.id);
    const from=ids.indexOf(id),to=ids.indexOf(neighbor.id);
    [ids[from],ids[to]]=[ids[to],ids[from]];
    ordering=true;
    try{
      await api('/api/order',{ids,revision});
      await load();
    }catch(error){
      if(error.status===409){
        try{
          await load();
          toast('作品库已刷新，请按当前顺序重试。');
        }catch(refreshError){toast(refreshError.message);}
      }else toast(error.message);
    }finally{ordering=false;}
  }
  function base64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.slice(reader.result.indexOf(',')+1));reader.onerror=()=>reject(Error('读取照片失败。'));reader.readAsDataURL(file);});}
  async function prepare(file){
    if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type))throw Error(file.name+'：请使用 JPG、PNG、WebP、GIF 或 AVIF。');
    if(file.size>25*1024*1024)throw Error(file.name+'：原图超过 25 MB，请先导出较小版本。');
    const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
    try{
      if(bitmap.width*bitmap.height>80000000)throw Error(file.name+'：图片像素较大，请先导出网页版本。');
      const ratio=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!preview)throw Error('无法生成网页展示图。');
      return {fileName:file.name,title:file.name.replace(/\.[^.]+$/,''),fileData:await base64(file),previewData:await base64(preview),width:canvas.width,height:canvas.height};
    } finally{bitmap.close();}
  }
  async function upload(files){
    if(uploading||!files.length)return;uploading=true;$('pick-files').disabled=true;$('upload-progress').hidden=false;
    let done=0;const errors=[];
    for(let index=0;index<files.length;index++){
      $('upload-text').textContent='正在处理 '+(index+1)+' / '+files.length+'：'+files[index].name;
      try{await api('/api/photos',await prepare(files[index]));done++;}catch(error){errors.push(error.message);}
      $('upload-meter').value=(index+1)/files.length*100;
    }
    uploading=false;$('pick-files').disabled=false;$('files').value='';$('upload-text').textContent='已上传 '+done+' 张照片，保存为草稿。'+(errors.length?' '+errors.length+' 张未成功。':'');await load();
    toast(errors.length?errors[0]:'照片已加入作品库，编辑后可在主页展示。');
  }
  $('pick-files').addEventListener('click',()=>$('files').click());$('files').addEventListener('change',()=>upload([...$('files').files]));
  ['dragenter','dragover'].forEach(name=>$('dropzone').addEventListener(name,event=>{event.preventDefault();$('dropzone').classList.add('dragging');}));
  ['dragleave','drop'].forEach(name=>$('dropzone').addEventListener(name,event=>{event.preventDefault();$('dropzone').classList.remove('dragging');}));
  $('dropzone').addEventListener('drop',event=>upload([...event.dataTransfer.files]));
  $('export').addEventListener('click',async()=>{
    const control=$('export');
    if(control.disabled)return;
    control.disabled=true;
    control.textContent='正在生成发布包…';
    toast('正在生成发布包。');
    try{
      await api('/api/export/prepare',{});
      const link=document.createElement('a');
      link.href='/api/export/download';
      link.download='hujie-public-website.zip';
      document.body.append(link);
      link.click();
      link.remove();
      toast('发布包已生成，浏览器开始下载。');
    }catch(error){
      toast(error.status?error.message:'无法连接本地管理服务，请检查服务后重试。');
    }finally{
      control.disabled=false;
      control.textContent='导出发布包 ↗';
    }
  });
  initialize().catch(error=>{ $('auth-panel').hidden=false;$('auth-error').textContent='无法连接本地管理服务，请通过“启动主页.cmd”启动。';});
})();
