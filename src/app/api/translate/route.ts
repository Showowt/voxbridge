import { NextRequest, NextResponse } from 'next/server'

const cache = new Map<string, string>()

// Quick translations for common phrases
const dict: Record<string, Record<string, string>> = {
  'en-es': {
    'hello': 'hola', 'hi': 'hola', 'hey': 'oye',
    'how are you': 'cómo estás', 'good morning': 'buenos días',
    'good afternoon': 'buenas tardes', 'good evening': 'buenas noches',
    'goodbye': 'adiós', 'bye': 'adiós', 'see you': 'nos vemos',
    'thank you': 'gracias', 'thanks': 'gracias',
    'please': 'por favor', 'yes': 'sí', 'no': 'no',
    'okay': 'está bien', 'ok': 'está bien',
    'sorry': 'lo siento', 'excuse me': 'disculpe',
    'i understand': 'entiendo', 'i don\'t understand': 'no entiendo',
    'can you repeat': 'puede repetir', 'nice to meet you': 'mucho gusto',
    'my name is': 'me llamo', 'what is your name': 'cómo te llamas',
    'where are you from': 'de dónde eres', 'i am from': 'soy de',
    'how much': 'cuánto cuesta', 'what time': 'qué hora es',
    'i need help': 'necesito ayuda', 'one moment': 'un momento',
    'wait': 'espera', 'yes please': 'sí por favor',
    'no thank you': 'no gracias', 'i like it': 'me gusta',
    'i don\'t like it': 'no me gusta', 'where is': 'dónde está',
    'what is this': 'qué es esto', 'i want': 'quiero',
    'i need': 'necesito', 'can i have': 'puedo tener',
    'the bill please': 'la cuenta por favor',
    'water': 'agua', 'food': 'comida', 'bathroom': 'baño',
    'help': 'ayuda', 'police': 'policía', 'doctor': 'médico',
  },
  'es-en': {
    'hola': 'hello', 'oye': 'hey',
    'cómo estás': 'how are you', 'buenos días': 'good morning',
    'buenas tardes': 'good afternoon', 'buenas noches': 'good evening',
    'adiós': 'goodbye', 'nos vemos': 'see you',
    'gracias': 'thank you', 'por favor': 'please',
    'sí': 'yes', 'no': 'no', 'está bien': 'okay',
    'lo siento': 'sorry', 'disculpe': 'excuse me',
    'entiendo': 'i understand', 'no entiendo': 'i don\'t understand',
    'puede repetir': 'can you repeat', 'mucho gusto': 'nice to meet you',
    'me llamo': 'my name is', 'cómo te llamas': 'what is your name',
    'de dónde eres': 'where are you from', 'soy de': 'i am from',
    'cuánto cuesta': 'how much', 'qué hora es': 'what time is it',
    'necesito ayuda': 'i need help', 'un momento': 'one moment',
    'espera': 'wait', 'sí por favor': 'yes please',
    'no gracias': 'no thank you', 'me gusta': 'i like it',
    'no me gusta': 'i don\'t like it', 'dónde está': 'where is',
    'qué es esto': 'what is this', 'quiero': 'i want',
    'necesito': 'i need', 'puedo tener': 'can i have',
    'la cuenta por favor': 'the bill please',
    'agua': 'water', 'comida': 'food', 'baño': 'bathroom',
    'ayuda': 'help', 'policía': 'police', 'médico': 'doctor',
  }
}

async function translateMyMemory(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}&de=voxbridge@app.com`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const t = data.responseData.translatedText
      if (t.includes('INVALID') || t.includes('MYMEMORY')) return null
      return t
    }
    return null
  } catch { return null }
}

async function translateHuggingFace(text: string, from: string, to: string): Promise<string | null> {
  const models: Record<string, string> = {
    'en-es': 'Helsinki-NLP/opus-mt-en-es',
    'es-en': 'Helsinki-NLP/opus-mt-es-en',
  }
  const model = models[`${from}-${to}`]
  if (!model) return null
  
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text }),
    })
    if (res.status === 503 || !res.ok) return null
    const data = await res.json()
    return Array.isArray(data) && data[0]?.translation_text ? data[0].translation_text : null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang } = await req.json()
    
    if (!text?.trim() || sourceLang === targetLang) {
      return NextResponse.json({ translation: text || '' })
    }
    
    if (!['en', 'es'].includes(sourceLang) || !['en', 'es'].includes(targetLang)) {
      return NextResponse.json({ translation: text })
    }

    const key = `${sourceLang}-${targetLang}:${text.toLowerCase().trim()}`
    if (cache.has(key)) {
      return NextResponse.json({ translation: cache.get(key) })
    }

    // Dictionary lookup
    const d = dict[`${sourceLang}-${targetLang}`]
    const lower = text.toLowerCase().trim()
    if (d?.[lower]) {
      cache.set(key, d[lower])
      return NextResponse.json({ translation: d[lower] })
    }

    // API calls
    let result = await translateMyMemory(text, sourceLang, targetLang)
    if (!result) result = await translateHuggingFace(text, sourceLang, targetLang)
    
    const final = result || text
    cache.set(key, final)
    return NextResponse.json({ translation: final })
  } catch {
    return NextResponse.json({ translation: '' }, { status: 500 })
  }
}
