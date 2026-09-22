export function registerPWA(){
  if(!import.meta.env.PROD||!('serviceWorker' in navigator))return;
  window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js').catch(error=>{console.error('No se pudo registrar el modo offline:',error);});});
}
