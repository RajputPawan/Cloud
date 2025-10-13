const cells = Array.from(document.querySelectorAll('.cell'))
const statusEl = document.getElementById('status')
const resetBtn = document.getElementById('reset')
const app = document.getElementById('app')
const themeToggle = document.getElementById('themeToggle')
const scoreXEl = document.getElementById('scoreX')
const scoreOEl = document.getElementById('scoreO')
const scoreDEl = document.getElementById('scoreD')

let board = Array(9).fill(null)
let current = 'X'
let active = true

const LS_THEME_KEY = 'ttt_theme'
const LS_SCORES_KEY = 'ttt_scores'

let scores = { X: 0, O: 0, D: 0 }

const wins = [
  [0,1,2], [3,4,5], [6,7,8],
  [0,3,6], [1,4,7], [2,5,8],
  [0,4,8], [2,4,6]
]

function setStatus(text) {
  statusEl.textContent = text
}

function applyTheme() {
  if (!app) return
  app.classList.toggle('theme-x', current === 'X')
  app.classList.toggle('theme-o', current === 'O')
}

function setLightMode(on) {
  if (!app) return
  app.classList.toggle('light', !!on)
  if (themeToggle) themeToggle.textContent = on ? 'Dark' : 'Light'
}

function loadTheme() {
  const saved = localStorage.getItem(LS_THEME_KEY)
  setLightMode(saved === 'light')
}

function saveTheme() {
  const isLight = app.classList.contains('light')
  localStorage.setItem(LS_THEME_KEY, isLight ? 'light' : 'dark')
}

function toggleTheme() {
  const isLight = app.classList.contains('light')
  setLightMode(!isLight)
  saveTheme()
}

function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_SCORES_KEY) || '{}')
    scores = { X: saved.X || 0, O: saved.O || 0, D: saved.D || 0 }
  } catch { scores = { X: 0, O: 0, D: 0 } }
  updateScoreboard()
}

function saveScores() {
  localStorage.setItem(LS_SCORES_KEY, JSON.stringify(scores))
}

function updateScoreboard() {
  if (scoreXEl) scoreXEl.textContent = String(scores.X)
  if (scoreOEl) scoreOEl.textContent = String(scores.O)
  if (scoreDEl) scoreDEl.textContent = String(scores.D)
}

function launchConfetti(durationMs = 900) {
  if (!app) return
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const r = app.getBoundingClientRect()
  canvas.width = r.width
  canvas.height = r.height
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '2'
  app.appendChild(canvas)

  const N = 140
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 40,
    vx: (Math.random() - 0.5) * 2.2,
    vy: 2 + Math.random() * 2.5,
    size: 3 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.2,
    color: Math.random() < 0.5 ? getComputedStyle(document.documentElement).getPropertyValue('--x').trim() : getComputedStyle(document.documentElement).getPropertyValue('--o').trim()
  }))

  let start = null
  function frame(ts) {
    if (!start) start = ts
    const elapsed = ts - start
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const p of parts) {
      p.vy += 0.02
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size, -p.size/2, p.size*2, p.size)
      ctx.restore()
    }
    if (elapsed < durationMs) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

function handleMove(i) {
  if (!active || board[i]) return
  board[i] = current
  const cell = cells[i]
  cell.textContent = current
  cell.classList.add(current.toLowerCase())
  cell.classList.add('played')
  cell.addEventListener('animationend', () => cell.classList.remove('played'), { once: true })

  const line = getWinningLine()
  if (line) {
    line.forEach(idx => cells[idx].classList.add('win'))
    setStatus(`${current} wins!`)
    // Update scoreboard
    scores[current] += 1
    updateScoreboard()
    saveScores()
    // Celebrate
    launchConfetti()
    active = false
    return
  }

  if (board.every(Boolean)) {
    setStatus('Draw!')
    scores.D += 1
    updateScoreboard()
    saveScores()
    active = false
    return
  }

  current = current === 'X' ? 'O' : 'X'
  setStatus(`${current}'s turn`)
  applyTheme()
}

function getWinningLine() {
  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return [a,b,c]
  }
  return null
}

function reset() {
  board = Array(9).fill(null)
  current = 'X'
  active = true
  cells.forEach(c => { c.textContent = ''; c.className = 'cell' })
  setStatus("X's turn")
  applyTheme()
}

cells.forEach((btn, i) => btn.addEventListener('click', () => handleMove(i)))
resetBtn.addEventListener('click', reset)

// Accent aura follows cursor within the app container
if (app) {
  app.addEventListener('mousemove', (e) => {
    const r = app.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    const y = ((e.clientY - r.top) / r.height) * 100
    app.style.setProperty('--mx', x + '%')
    app.style.setProperty('--my', y + '%')
  })
  app.addEventListener('mouseleave', () => {
    app.style.setProperty('--mx', '50%')
    app.style.setProperty('--my', '-10%')
  })
}

// Theme toggle
if (themeToggle) themeToggle.addEventListener('click', toggleTheme)

// Initialize theme on load
applyTheme()
loadTheme()
loadScores()
