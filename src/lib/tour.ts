import { driver, type Driver, type PopoverDOM } from 'driver.js'

export type MascotMood = 'wave' | 'point' | 'celebrate' | 'think' | 'excited'

export type TourStep = {
  id: string
  element: string
  title: string
  description: string
  chapter?: string
  mascotMood?: MascotMood
  mascotMessage?: string
  mascotPosition?: 'left' | 'right'
  minRole?: 'owner' | 'admin' | 'manager' | 'staff' | 'cleaner'
  side?: 'left' | 'right' | 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
}

type TourCallbacks = {
  onComplete?: () => void
  onSkip?: () => void
  onStepChange?: (index: number, total: number, step: TourStep) => void
  renderPopover?: (popover: PopoverDOM, context: {
    step: TourStep
    index: number
    total: number
    driver: Driver
  }) => void
}

function ensurePopoverEnhancements(
  popover: PopoverDOM,
  step: TourStep,
  index: number,
  total: number,
  driverInstance: Driver
) {
  const wrapper = popover.wrapper
  wrapper.classList.add('tour-popover-enhanced')
  wrapper.dataset.tourChapter = step.chapter || ''

  // Chapter badge
  let chapter = wrapper.querySelector<HTMLDivElement>('.tour-popover-chapter')
  if (step.chapter) {
    if (!chapter) {
      chapter = document.createElement('div')
      chapter.className = 'tour-popover-chapter'
      popover.title?.parentElement?.insertBefore(chapter, popover.title)
    }
    chapter.textContent = step.chapter
  } else if (chapter) {
    chapter.remove()
  }

  // Progress bar
  let progress = wrapper.querySelector<HTMLDivElement>('.tour-progress')
  if (!progress) {
    progress = document.createElement('div')
    progress.className = 'tour-progress'
    const bar = document.createElement('div')
    bar.className = 'tour-progress-bar'
    progress.appendChild(bar)
    popover.footer?.parentElement?.insertBefore(progress, popover.footer)
  }
  const bar = progress.querySelector<HTMLDivElement>('.tour-progress-bar')
  if (bar) {
    bar.style.width = `${Math.round(((index + 1) / total) * 100)}%`
  }

  // Skip button
  if (popover.footer && !popover.footer.querySelector('.tour-skip-btn')) {
    const skipBtn = document.createElement('button')
    skipBtn.type = 'button'
    skipBtn.className = 'tour-skip-btn'
    skipBtn.textContent = 'Skip Tour'
    skipBtn.addEventListener('click', () => {
      driverInstance.destroy()
    })
    popover.footer.insertBefore(skipBtn, popover.footer.firstChild)
  }
}

export function buildTourDriver(steps: TourStep[], callbacks: TourCallbacks = {}): Driver {
  let wasCompleted = false

  return driver({
    showProgress: true,
    allowClose: true,
    stagePadding: 6,
    stageRadius: 12,
    allowKeyboardControl: true,
    overlayClickBehavior: 'close',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Finish',
    popoverClass: 'tour-popover',
    onDestroyed: () => {
      if (wasCompleted) {
        callbacks.onComplete?.()
      } else {
        callbacks.onSkip?.()
      }
      wasCompleted = false
    },
    onNextClick: (_element, _step, { driver: instance }) => {
      if (instance.isLastStep()) {
        wasCompleted = true
        instance.destroy()
        return
      }
      instance.moveNext()
    },
    onPrevClick: (_element, _step, { driver: instance }) => {
      instance.movePrevious()
    },
    onPopoverRender: (popover, { driver: instance }) => {
      const index = instance.getActiveIndex() ?? 0
      const step = steps[index] ?? steps[0]
      const total = steps.length
      ensurePopoverEnhancements(popover, step, index, total, instance)
      callbacks.onStepChange?.(index, total, step)
      callbacks.renderPopover?.(popover, { step, index, total, driver: instance })
    },
    steps: steps.map((step) => ({
      element: step.element,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? 'bottom',
        align: step.align ?? 'start',
      },
    })),
  })
}
