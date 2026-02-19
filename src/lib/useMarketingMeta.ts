import { useEffect } from 'react'

function setMetaTag(attrs: Record<string, string>) {
  const selectorKey = attrs.name ? 'name' : 'property'
  const selectorValue = attrs.name || attrs.property || ''
  if (!selectorValue) return

  let tag = document.querySelector(`meta[${selectorKey}="${selectorValue}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(selectorKey, selectorValue)
    document.head.appendChild(tag)
  }

  Object.entries(attrs).forEach(([key, value]) => {
    tag?.setAttribute(key, value)
  })
}

interface MarketingMeta {
  title: string
  description: string
  keywords?: string
  url?: string
}

export function useMarketingMeta({ title, description, keywords, url }: MarketingMeta) {
  useEffect(() => {
    document.title = title
    setMetaTag({ name: 'description', content: description })
    if (keywords) {
      setMetaTag({ name: 'keywords', content: keywords })
    }
    setMetaTag({ property: 'og:title', content: title })
    setMetaTag({ property: 'og:description', content: description })
    if (url) {
      setMetaTag({ property: 'og:url', content: url })
      let canonical = document.querySelector('link[rel="canonical"]')
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.setAttribute('rel', 'canonical')
        document.head.appendChild(canonical)
      }
      canonical.setAttribute('href', url)
    }
  }, [title, description, keywords, url])
}
