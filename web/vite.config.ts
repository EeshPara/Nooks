import { defineConfig } from 'vite';
import { studySplitPlugin } from './scripts/study-split-plugin.mjs';
export default defineConfig(() => {
 const browserPreview=process.env.VITE_NOOKS_PUBLIC_PREVIEW==='1';
 return {root:'ui',build:{outDir:'../dist',emptyOutDir:true},plugins:[studySplitPlugin(),...(browserPreview?[{name:'nooks-device-config',configureServer(server){server.middlewares.use('/api/config',(req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({backend:'unconfigured',capabilities:{generation:false}}));});}}]:[])],server:{proxy:browserPreview?undefined:{'/api':'http://127.0.0.1:8787'}}};
});
