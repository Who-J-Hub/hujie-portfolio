/* Local MediaPipe inference. Only landmarks leave this worker; frames are closed. */
self.exports={};
importScripts('./mediapipe/vision_bundle.cjs');
const {FilesetResolver,HandLandmarker,FaceLandmarker}=self.exports;
let handModel,faceModel;

async function initialize(){
  const files=await FilesetResolver.forVisionTasks(new URL('./mediapipe/wasm',self.location.href).href);
  async function makeTasks(delegate){
    let hand;
    try{
      hand=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/hand_landmarker.task',self.location.href).href,delegate},runningMode:'VIDEO',numHands:2});
      const face=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/face_landmarker.task',self.location.href).href,delegate},runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true});
      return [hand,face];
    }catch(error){hand?.close();throw error;}
  }
  let delegate='GPU';
  try{[handModel,faceModel]=await makeTasks(delegate);}
  catch(error){delegate='CPU';[handModel,faceModel]=await makeTasks(delegate);}
  self.postMessage({type:'ready',delegate});
}

self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{await initialize();}catch(error){self.postMessage({type:'error',message:error.message});}
    return;
  }
  if(data.type!=='frame')return;
  const {bitmap,timestamp}=data;
  try{
    const before=performance.now();
    const hand=handModel.detectForVideo(bitmap,timestamp);
    const face=faceModel.detectForVideo(bitmap,timestamp);
    self.postMessage({type:'result',hands:hand.landmarks,face:{faceLandmarks:face.faceLandmarks,faceBlendshapes:face.faceBlendshapes},duration:performance.now()-before});
  }catch(error){self.postMessage({type:'error',message:error.message});}
  finally{bitmap.close();}
};
