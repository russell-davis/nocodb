import { type Socket, io } from 'socket.io-client'
import type { ComputedRef } from 'vue'
import { onBeforeUnmount, ref, watch } from 'vue'
import { defineNuxtPlugin } from '#app'

declare module '#app' {
  interface NuxtApp {
    $socket: ComputedRef<Socket | null>
    $realtime: {
      on: (callback: (event: { type: string; data: any }) => void) => void
      subscribe: (workspace_id: string, base_id: string) => Promise<void>
      unsubscribe: (workspace_id: string, base_id: string) => Promise<void>
    }
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const socket = ref<Socket | null>(null)
  const { appInfo, signedIn, token } = useGlobal()

  const realtimeEvents = {
    listeners: [] as ((event: { type: string; data: any }) => void)[],
    on(callback: (event: { type: string; data: any }) => void) {
      this.listeners.push(callback)
    },
    trigger(event: { type: string; data: any }) {
      this.listeners.forEach((callback) => callback(event))
    },
  }

  const initSocket = async (authToken: string) => {
    try {
      if (socket.value?.connected) {
        socket.value.disconnect()
      }

      const url = new URL(appInfo.value.ncSiteUrl, window.location.href.split(/[?#]/)[0])
      const socketPath = url.pathname.endsWith('/') ? `${url.pathname}socket.io` : `${url.pathname}/socket.io`

      const newSocket = io(url.href, {
        extraHeaders: { 'xc-auth': authToken },
        path: socketPath,
      })

      newSocket.on('connect', () => {
        console.log('Realtime connected:', newSocket.id)
      })

      newSocket.on('connect_error', (err) => {
        console.error('Realtime connect error:', err.message)
      })

      newSocket.on('disconnect', (reason) => {
        console.log('Realtime disconnected:', reason)
        if (reason === 'io server disconnect') {
          newSocket.disconnect()
          socket.value = null
        }
      })

      newSocket.onAny((eventName: string, data: any) => {
        if (['META_INSERT', 'META_UPDATE', 'META_DELETE'].includes(eventName)) {
          realtimeEvents.trigger({ type: eventName, data })
        }
      })

      socket.value = newSocket
    } catch (err) {
      console.error('Realtime initialization failed:', err)
      socket.value = null
    }
  }

  const subscribe = async (workspace_id: string, base_id: string) => {
    if (!socket.value?.connected) {
      throw new Error('Socket not connected')
    }
    return new Promise<void>((resolve, reject) => {
      socket.value!.emit(
        'subscribe',
        JSON.stringify({ workspace_id, base_id }),
        (response: { status: string; channel: string }) => {
          if (response.status === 'subscribed') {
            console.log(`Subscribed to channel: ${response.channel}`)
            resolve()
          } else {
            reject(new Error('Subscription failed'))
          }
        },
      )
    })
  }

  const unsubscribe = async (workspace_id: string, base_id: string) => {
    if (!socket.value?.connected) {
      return
    }
    return new Promise<void>((resolve, reject) => {
      socket.value!.emit(
        'unsubscribe',
        JSON.stringify({ workspace_id, base_id }),
        (response: { status: string; channel: string }) => {
          if (response.status === 'unsubscribed') {
            console.log(`Unsubscribed from channel: ${response.channel}`)
            resolve()
          } else {
            reject(new Error('Unsubscription failed'))
          }
        },
      )
    })
  }

  if (signedIn.value && token.value) {
    initSocket(token.value)
  }

  watch(
    token,
    (newToken, oldToken) => {
      if (newToken && newToken !== oldToken) {
        initSocket(newToken)
      } else if (!newToken && socket.value) {
        socket.value.disconnect()
        socket.value = null
      }
    },
    { immediate: false },
  )

  onBeforeUnmount(() => {
    if (socket.value?.connected) {
      socket.value.disconnect()
      socket.value = null
    }
  })

  nuxtApp.provide('socket', socket)
  nuxtApp.provide('realtime', {
    on: realtimeEvents.on.bind(realtimeEvents),
    subscribe,
    unsubscribe,
  })
})
