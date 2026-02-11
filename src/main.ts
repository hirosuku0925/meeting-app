import './style.css'
import { Peer, type MediaConnection } from 'peerjs'

/* ===============================
   UI
================================ */
document.body.innerHTML = `
<div style="display:flex;height:100vh;flex-direction:column;background:#000;color:#fff;font-family:sans-serif;">
  <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;">
    <video id="main-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:contain;"></video>
  </div>
  <div style="height:90px;background:#111;display:flex;align-items:center;justify-content:center;gap:10px;">
    <button id="mic">🎤</button>
    <button id="cam">📹</button>
    <button id="avatar">🎭</button>
    <input id="room" placeholder="部屋名">
    <button id="join">参加</button>
  </div>
  <div id="remotes" style="display:flex;gap:10px;padding:10px;background:#000;"></div>
</div>
`

const mainVideo = document.getElementById("main-video") as HTMLVideoElement
const remoteArea = document.getElementById("remotes") as HTMLDivElement

/* ===============================
   変数
================================ */
let localStream: MediaStream
let currentStream: MediaStream
let avatarStream: MediaStream | null = null
let peer: Peer | null = null
const calls = new Map<string, MediaConnection>()

/* ===============================
   カメラ取得
================================ */
async function initCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  currentStream = localStream
  mainVideo.srcObject = localStream
}
initCamera()

/* ===============================
   アバター（Canvas加工）
================================ */
function startAvatar() {
  const canvas = document.createElement("canvas")
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext("2d")!

  const video = document.createElement("video")
  video.srcObject = localStream
  video.play()

  function draw() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 簡易アバター表示
    ctx.fillStyle = "rgba(0,0,0,0.5)"
    ctx.fillRect(0, 350, 640, 130)
    ctx.fillStyle = "white"
    ctx.font = "40px sans-serif"
    ctx.fillText("AVATAR MODE 😎", 150, 430)

    requestAnimationFrame(draw)
  }
  draw()

  avatarStream = canvas.captureStream(30)

  // 音声追加
  localStream.getAudioTracks().forEach(track => {
    avatarStream!.addTrack(track)
  })

  switchStream(avatarStream)
}

function stopAvatar() {
  if (!avatarStream) return
  switchStream(localStream)
  avatarStream.getTracks().forEach(t => t.stop())
  avatarStream = null
}

/* ===============================
   ストリーム切替
================================ */
function switchStream(stream: MediaStream) {
  currentStream = stream
  mainVideo.srcObject = stream

  calls.forEach(call => {
    const pc = (call as any).peerConnection
    pc.getSenders().forEach((sender: RTCRtpSender) => {
      const track = stream.getTracks().find(t => t.kind === sender.track?.kind)
      if (track) sender.replaceTrack(track)
    })
  })
}

/* ===============================
   Peer接続
================================ */
function joinRoom(room: string) {
  if (peer) peer.destroy()

  peer = new Peer(room + "-" + Math.floor(Math.random() * 10000))

  peer.on("open", id => {
    console.log("My ID:", id)
  })

  peer.on("call", call => {
    call.answer(currentStream)
    handleCall(call)
  })
}

function handleCall(call: MediaConnection) {
  calls.set(call.peer, call)

  call.on("stream", stream => {
    const video = document.createElement("video")
    video.srcObject = stream
    video.autoplay = true
    video.playsInline = true
    video.style.width = "200px"
    remoteArea.appendChild(video)
  })

  call.on("close", () => {
    calls.delete(call.peer)
  })
}

/* ===============================
   UIイベント
================================ */

document.getElementById("mic")!.onclick = () => {
  const track = localStream.getAudioTracks()[0]
  track.enabled = !track.enabled
}

document.getElementById("cam")!.onclick = () => {
  const track = localStream.getVideoTracks()[0]
  track.enabled = !track.enabled
}

let avatarOn = false
document.getElementById("avatar")!.onclick = () => {
  avatarOn = !avatarOn
  avatarOn ? startAvatar() : stopAvatar()
}

document.getElementById("join")!.onclick = () => {
  const room = (document.getElementById("room") as HTMLInputElement).value
  if (!room) return alert("部屋名を入れてね")
  joinRoom(room)
}
