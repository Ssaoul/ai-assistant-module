/**
 * DOMAnalyzer - 화면 요소 자동 분석 및 매핑
 */

export interface InteractiveElement {
  id: string
  type: 'button' | 'link' | 'input' | 'select' | 'form'
  label: string
  description: string
  selector: string
  element: HTMLElement
  isVisible: boolean
  boundingRect: DOMRect
  ariaLabel?: string
  role?: string
}

export interface ElementMap {
  buttons: InteractiveElement[]
  links: InteractiveElement[]
  forms: InteractiveElement[]
  inputs: InteractiveElement[]
  navigation: InteractiveElement[]
}

export class DOMAnalyzer {
  private observer: MutationObserver | null = null
  private elementCache: ElementMap | null = null
  private cacheTimestamp = 0
  private readonly CACHE_DURATION = 5000 // 5초 캐시

  constructor() {
    this.initializeMutationObserver()
  }

  private initializeMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      const hasStructuralChanges = mutations.some(mutation => 
        mutation.type === 'childList' || 
        (mutation.type === 'attributes' && 
         ['class', 'id', 'aria-label', 'role'].includes(mutation.attributeName || ''))
      )
      
      if (hasStructuralChanges) {
        this.invalidateCache()
      }
    })
  }  async scanPage(): Promise<ElementMap> {
    if (this.isCacheValid()) {
      return this.elementCache!
    }

    const elements: ElementMap = {
      buttons: [],
      links: [],
      forms: [],
      inputs: [],
      navigation: []
    }

    // 버튼 요소 스캔
    const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]')
    buttons.forEach((btn, index) => {
      if (this.isElementVisible(btn as HTMLElement)) {
        elements.buttons.push(this.createElementInfo(btn as HTMLElement, 'button', `btn-${index}`))
      }
    })

    // 링크 요소 스캔  
    const links = document.querySelectorAll('a[href]')
    links.forEach((link, index) => {
      if (this.isElementVisible(link as HTMLElement)) {
        elements.links.push(this.createElementInfo(link as HTMLElement, 'link', `link-${index}`))
      }
    })

    // 입력 요소 스캔
    const inputs = document.querySelectorAll('input:not([type="submit"]), textarea, select')
    inputs.forEach((input, index) => {
      if (this.isElementVisible(input as HTMLElement)) {
        elements.inputs.push(this.createElementInfo(input as HTMLElement, 'input', `input-${index}`))
      }
    })

    // 폼 요소 스캔
    const forms = document.querySelectorAll('form')
    forms.forEach((form, index) => {
      if (this.isElementVisible(form as HTMLElement)) {
        elements.forms.push(this.createElementInfo(form as HTMLElement, 'form', `form-${index}`))
      }
    })

    // 네비게이션 요소 스캔
    const navElements = document.querySelectorAll('nav, [role="navigation"], .menu, .navbar')
    navElements.forEach((nav, index) => {
      if (this.isElementVisible(nav as HTMLElement)) {
        elements.navigation.push(this.createElementInfo(nav as HTMLElement, 'button', `nav-${index}`))
      }
    })

    this.cacheElements(elements)
    return elements
  }  private createElementInfo(element: HTMLElement, type: InteractiveElement['type'], id: string): InteractiveElement {
    const rect = element.getBoundingClientRect()
    const label = this.extractElementLabel(element)
    
    return {
      id,
      type,
      label,
      description: this.generateDescription(element, label),
      selector: this.generateSelector(element),
      element,
      isVisible: this.isElementVisible(element),
      boundingRect: rect,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      role: element.getAttribute('role') || undefined
    }
  }

  private extractElementLabel(element: HTMLElement): string {
    // ARIA 라벨 우선
    const ariaLabel = element.getAttribute('aria-label')
    if (ariaLabel) return ariaLabel

    // 텍스트 콘텐츠
    const textContent = element.textContent?.trim()
    if (textContent && textContent.length < 50) return textContent

    // placeholder 텍스트
    const placeholder = element.getAttribute('placeholder')
    if (placeholder) return placeholder

    // 폼 라벨 연결
    const id = element.getAttribute('id')
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`)
      if (label?.textContent) return label.textContent.trim()
    }

    return element.tagName.toLowerCase()
  }

  private generateDescription(element: HTMLElement, label: string): string {
    const tag = element.tagName.toLowerCase()
    
    switch (tag) {
      case 'button':
      case 'input':
        return `${label} 버튼`
      case 'a':
        return `${label} 링크`
      case 'select':
        return `${label} 선택 메뉴`
      case 'textarea':
        return `${label} 텍스트 입력창`
      default:
        return label
    }
  }  private generateSelector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`
    
    const className = element.className
    if (className && typeof className === 'string') {
      const classes = className.split(' ').filter(c => c.length > 0)
      if (classes.length > 0) {
        return `.${classes[0]}`
      }
    }
    
    const tagName = element.tagName.toLowerCase()
    const parent = element.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName)
      const index = siblings.indexOf(element)
      return `${tagName}:nth-of-type(${index + 1})`
    }
    
    return tagName
  }

  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    
    return rect.width > 0 && 
           rect.height > 0 && 
           style.display !== 'none' && 
           style.visibility !== 'hidden' &&
           style.opacity !== '0'
  }

  private isCacheValid(): boolean {
    return this.elementCache !== null && 
           (Date.now() - this.cacheTimestamp) < this.CACHE_DURATION
  }

  private cacheElements(elements: ElementMap): void {
    this.elementCache = elements
    this.cacheTimestamp = Date.now()
  }

  private invalidateCache(): void {
    this.elementCache = null
  }

  findElementByDescription(description: string): HTMLElement | null {
    const normalizedDesc = description.toLowerCase().trim()
    
    // 캐시에서 검색
    if (this.elementCache) {
      const allElements = [
        ...this.elementCache.buttons,
        ...this.elementCache.links,
        ...this.elementCache.inputs,
        ...this.elementCache.forms,
        ...this.elementCache.navigation
      ]
      
      for (const elem of allElements) {
        if (elem.label.toLowerCase().includes(normalizedDesc) ||
            elem.description.toLowerCase().includes(normalizedDesc)) {
          return elem.element
        }
      }
    }
    
    return null
  }

  startObserving(): void {
    if (this.observer) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'id', 'aria-label', 'role']
      })
    }
  }

  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect()
    }
  }
}