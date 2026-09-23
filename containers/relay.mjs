// Container-local TCP endpoint for the one trial-scoped Unix socket. The
// container has no network interface other than loopback and no provider key.
import { createServer, createConnection } from 'node:net'
import { spawn } from 'node:child_process'

const [portText,...command]=process.argv.slice(2),port=Number(portText)
if(!Number.isInteger(port)||port<1024||port>65535||!command.length)throw new Error('invalid relay launch')
const sockets=new Set()
const server=createServer(client=>{
  const upstream=createConnection('/broker.sock')
  sockets.add(client);sockets.add(upstream)
  const close=()=>{client.destroy();upstream.destroy();sockets.delete(client);sockets.delete(upstream)}
  client.on('error',close);upstream.on('error',close)
  client.on('close',close);upstream.on('close',close)
  client.pipe(upstream).pipe(client)
})
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
const child=spawn(command[0],command.slice(1),{stdio:'inherit'})
let ending=false
function finish(code){if(ending)return;ending=true;for(const socket of sockets)socket.destroy();server.close(()=>process.exit(code))}
child.once('error',()=>finish(1));child.once('close',(code,signal)=>finish(signal?1:code??1))
process.on('SIGTERM',()=>{child.kill('SIGTERM');setTimeout(()=>finish(1),1000).unref()})
