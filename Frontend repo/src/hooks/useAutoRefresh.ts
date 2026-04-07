import { useEffect, useRef } from 'react'

export function useAutoRefresh(reloadFn: () => void, intervalSeconds = 10) {
  const ref = useRef(reloadFn)
  ref.current = reloadFn

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (t) {
        clearInterval(t)
        t = null
      }
    }

    const start = () => {
      stop()
      t = setInterval(() => {
        if (!document.hidden) ref.current()
      }, intervalSeconds * 1000)
    }

    start()

    const onVisible = () => {
      if (!document.hidden) {
        ref.current()
        start()
      } else {
        stop()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalSeconds])
}
