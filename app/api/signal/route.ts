import { NextRequest, NextResponse } from 'next/server'

// In-memory signaling store (works for Vercel serverless with some limitations)
// For production, use Redis or a database
const rooms = new Map<string, {
  host?: { offer?: any; candidates: any[]; lastPing: number }
  guest?: { answer?: any; candidates: any[]; lastPing: number }
}>()

// Clean up old rooms every request
function cleanup() {
  const now = Date.now()
  const timeout = 5 * 60 * 1000 // 5 minutes
  for (const [roomId, room] of rooms.entries()) {
    const hostStale = !room.host || (now - room.host.lastPing > timeout)
    const guestStale = !room.guest || (now - room.guest.lastPing > timeout)
    if (hostStale && guestStale) {
      rooms.delete(roomId)
    }
  }
}

export async function POST(request: NextRequest) {
  cleanup()

  try {
    const body = await request.json()
    const { roomId, role, type, data } = body

    if (!roomId || !role || !type) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    let room = rooms.get(roomId)
    if (!room) {
      room = {}
      rooms.set(roomId, room)
    }

    const now = Date.now()

    if (role === 'host') {
      if (!room.host) room.host = { candidates: [], lastPing: now }
      room.host.lastPing = now

      if (type === 'offer') {
        room.host.offer = data
        room.host.candidates = []
        // Clear old guest data when new offer comes in
        if (room.guest) {
          room.guest.answer = undefined
          room.guest.candidates = []
        }
      } else if (type === 'candidate' && data) {
        room.host.candidates.push(data)
      }
    } else if (role === 'guest') {
      if (!room.guest) room.guest = { candidates: [], lastPing: now }
      room.guest.lastPing = now

      if (type === 'answer') {
        room.guest.answer = data
      } else if (type === 'candidate' && data) {
        room.guest.candidates.push(data)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  cleanup()

  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId')
  const role = searchParams.get('role')
  const lastCandidateIndex = parseInt(searchParams.get('lastCandidateIndex') || '0')

  if (!roomId || !role) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const room = rooms.get(roomId)
  if (!room) {
    return NextResponse.json({ room: null })
  }

  // Update ping time
  const now = Date.now()
  if (role === 'host' && room.host) {
    room.host.lastPing = now
  } else if (role === 'guest' && room.guest) {
    room.guest.lastPing = now
  }

  if (role === 'host') {
    // Host wants to know about guest's answer and candidates
    return NextResponse.json({
      answer: room.guest?.answer || null,
      candidates: room.guest?.candidates?.slice(lastCandidateIndex) || [],
      guestConnected: !!room.guest
    })
  } else {
    // Guest wants to know about host's offer and candidates
    return NextResponse.json({
      offer: room.host?.offer || null,
      candidates: room.host?.candidates?.slice(lastCandidateIndex) || [],
      hostConnected: !!room.host
    })
  }
}
