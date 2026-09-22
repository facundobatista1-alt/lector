import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const crcTable = new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(name,data){const body=Buffer.concat([Buffer.from(name),data]);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc(body),out.length-4);return out;}
function icon(size){
  const raw=Buffer.alloc((size*4+1)*size);
  const inside=(x,y)=>x>=size*.12&&x<size*.88&&y>=size*.12&&y<size*.88;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*(size*4+1)+1+x*4;
    const bg=inside(x,y), line=x>=size*.38&&x<size*.47&&y>=size*.25&&y<size*.69;
    const foot=x>=size*.38&&x<size*.67&&y>=size*.64&&y<size*.71;
    const dot=x>=size*.64&&x<size*.71&&y>=size*.64&&y<size*.71;
    const light=line||foot||dot;
    const rgb=light?[245,241,225]:bg?[37,79,65]:[245,244,239];
    raw[i]=rgb[0];raw[i+1]=rgb[1];raw[i+2]=rgb[2];raw[i+3]=255;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir('public/icons',{recursive:true});
for(const size of [192,512])await writeFile(`public/icons/icon-${size}.png`,icon(size));
