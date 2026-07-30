import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export function CreateInterceptPage() {
  const nav = useNavigate()
  const [slots, setSlots] = useState<Record<string, { used: number; max: number }>>({})

  useEffect(() => {
    void api.slots().then(setSlots)
  }, [])

  const learning = slots.learning

  return (
    <div className="page-narrow">
      <h1>学习槽已满</h1>
      <p className="lead">
        当前学习期占用 {learning?.used ?? 1}/{learning?.max ?? 1}。
        请先推进到练习期、休眠或废弃现有学习主题，再新建。
      </p>
      <div className="stack">
        <button className="ds-btn ds-btn--brand" type="button" onClick={() => nav('/')}>
          回到今天，处理现有主题
        </button>
        <Link className="ds-btn ds-btn--secondary" to="/review">先做周复盘再决定</Link>
      </div>
    </div>
  )
}
