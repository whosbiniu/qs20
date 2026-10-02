// Studio look: slider fields become filled bars (name left, value right). The panels are re-rendered on every
// change, so new sliders are picked up by an observer; values follow input events.
(() => {
  const root = document.getElementById('post-creator')
  const show = input => {
    const min = +input.min || 0, max = +input.max || 1, v = +input.value
    input.parentElement.style.setProperty('--p', ((v - min) / (max - min) * 100).toFixed(1) + '%')
    const step = input.step || '1'
    const text = max <= 1 && min >= 0 ? Math.round(v * 100) + '%' : step.includes('.') ? v.toFixed(2) + '×' : String(v)
    const out = input.parentElement.querySelector('.pc-val')
    if (out.textContent !== text) out.textContent = text  // unchanged text: no mutation, so the observer settles
  }
  const dress = () => root.querySelectorAll('label > input[type=range]').forEach(input => {
    const label = input.parentElement
    if (!label.classList.contains('pc-range')) { label.classList.add('pc-range'); const val = document.createElement('span'); val.className = 'pc-val'; label.append(val) }
    show(input)
  })
  new MutationObserver(dress).observe(root, { childList: true, subtree: true })
  root.addEventListener('input', e => { if (e.target.type === 'range' && e.target.parentElement.classList.contains('pc-range')) show(e.target) })
  dress()
})()
