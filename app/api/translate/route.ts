import { NextRequest, NextResponse } from 'next/server'

// In-memory cache for translations
const cache = new Map<string, string>()

// Common phrases dictionary with PROPER UTF-8 encoding
const dict: Record<string, Record<string, string>> = {
  'en-es': {
    'hello': 'hola',
    'hi': 'hola',
    'hey': 'oye',
    'how are you': 'cómo estás',
    'how are you doing': 'cómo te va',
    'good morning': 'buenos días',
    'good afternoon': 'buenas tardes',
    'good evening': 'buenas noches',
    'good night': 'buenas noches',
    'goodbye': 'adiós',
    'bye': 'adiós',
    'see you': 'nos vemos',
    'see you later': 'hasta luego',
    'thank you': 'gracias',
    'thanks': 'gracias',
    'thank you very much': 'muchas gracias',
    'please': 'por favor',
    'yes': 'sí',
    'no': 'no',
    'okay': 'está bien',
    'ok': 'está bien',
    'sorry': 'lo siento',
    'excuse me': 'disculpe',
    'i understand': 'entiendo',
    "i don't understand": 'no entiendo',
    'can you repeat': 'puede repetir',
    'can you repeat that': 'puede repetir eso',
    'nice to meet you': 'mucho gusto',
    'my name is': 'me llamo',
    'what is your name': 'cómo te llamas',
    "what's your name": 'cómo te llamas',
    'where are you from': 'de dónde eres',
    'i am from': 'soy de',
    "i'm from": 'soy de',
    'how much': 'cuánto cuesta',
    'how much is it': 'cuánto cuesta',
    'what time': 'qué hora es',
    'what time is it': 'qué hora es',
    'i need help': 'necesito ayuda',
    'help me': 'ayúdame',
    'one moment': 'un momento',
    'wait': 'espera',
    'yes please': 'sí por favor',
    'no thank you': 'no gracias',
    'i like it': 'me gusta',
    "i don't like it": 'no me gusta',
    'where is': 'dónde está',
    'what is this': 'qué es esto',
    'i want': 'quiero',
    'i need': 'necesito',
    'can i have': 'puedo tener',
    'the bill please': 'la cuenta por favor',
    'water': 'agua',
    'food': 'comida',
    'bathroom': 'baño',
    'help': 'ayuda',
    'police': 'policía',
    'doctor': 'médico',
    'hospital': 'hospital',
    'i love you': 'te quiero',
    'good': 'bueno',
    'bad': 'malo',
    'very good': 'muy bueno',
    'delicious': 'delicioso',
    'beautiful': 'hermoso',
    'today': 'hoy',
    'tomorrow': 'mañana',
    'yesterday': 'ayer',
    'now': 'ahora',
    'later': 'después',
    'always': 'siempre',
    'never': 'nunca',
    'more': 'más',
    'less': 'menos',
    'here': 'aquí',
    'there': 'allí',
    'left': 'izquierda',
    'right': 'derecha',
    'straight': 'recto',
  },
  'es-en': {
    'hola': 'hello',
    'oye': 'hey',
    'cómo estás': 'how are you',
    'cómo te va': 'how are you doing',
    'buenos días': 'good morning',
    'buenas tardes': 'good afternoon',
    'buenas noches': 'good evening',
    'adiós': 'goodbye',
    'nos vemos': 'see you',
    'hasta luego': 'see you later',
    'gracias': 'thank you',
    'muchas gracias': 'thank you very much',
    'por favor': 'please',
    'sí': 'yes',
    'no': 'no',
    'está bien': 'okay',
    'lo siento': 'sorry',
    'disculpe': 'excuse me',
    'perdón': 'sorry',
    'entiendo': 'i understand',
    'no entiendo': "i don't understand",
    'puede repetir': 'can you repeat',
    'mucho gusto': 'nice to meet you',
    'me llamo': 'my name is',
    'cómo te llamas': 'what is your name',
    'de dónde eres': 'where are you from',
    'soy de': 'i am from',
    'cuánto cuesta': 'how much is it',
    'qué hora es': 'what time is it',
    'necesito ayuda': 'i need help',
    'ayúdame': 'help me',
    'un momento': 'one moment',
    'espera': 'wait',
    'sí por favor': 'yes please',
    'no gracias': 'no thank you',
    'me gusta': 'i like it',
    'no me gusta': "i don't like it",
    'dónde está': 'where is',
    'qué es esto': 'what is this',
    'quiero': 'i want',
    'necesito': 'i need',
    'puedo tener': 'can i have',
    'la cuenta por favor': 'the bill please',
    'agua': 'water',
    'comida': 'food',
    'baño': 'bathroom',
    'ayuda': 'help',
    'policía': 'police',
    'médico': 'doctor',
    'hospital': 'hospital',
    'te quiero': 'i love you',
    'te amo': 'i love you',
    'bueno': 'good',
    'malo': 'bad',
    'muy bueno': 'very good',
    'delicioso': 'delicious',
    'hermoso': 'beautiful',
    'hoy': 'today',
    'mañana': 'tomorrow',
    'ayer': 'yesterday',
    'ahora': 'now',
    'después': 'later',
    'siempre': 'always',
    'nunca': 'never',
    'más': 'more',
    'menos': 'less',
    'aquí': 'here',
    'allí': 'there',
    'izquierda': 'left',
    'derecha': 'right',
    'recto': 'straight',
  }
}

// Primary translation API - MyMemory (free, no key needed)
async function translateMyMemory(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}&de=voxlink@machinemind.app`
    const res = await fetch(url, { 
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    if (!res.ok) return null
    
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText
      // Filter out error messages
      if (translated.toUpperCase().includes('INVALID') || 
          translated.toUpperCase().includes('MYMEMORY') ||
          translated.toUpperCase().includes('LIMIT')) {
        return null
      }
      return translated
    }
    return null
  } catch { 
    return null 
  }
}

// Fallback translation API - HuggingFace (free tier)
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
      signal: AbortSignal.timeout(8000) // 8 second timeout (model might need to warm up)
    })
    
    // Model loading - return null to use fallback
    if (res.status === 503) return null
    if (!res.ok) return null
    
    const data = await res.json()
    if (Array.isArray(data) && data[0]?.translation_text) {
      return data[0].translation_text
    }
    return null
  } catch { 
    return null 
  }
}

// Simple rule-based translation for very common patterns
function simpleTranslate(text: string, from: string, to: string): string | null {
  // Only handles very basic single words as absolute fallback
  const words: Record<string, Record<string, string>> = {
    'en-es': {
      'yes': 'sí', 'no': 'no', 'hello': 'hola', 'bye': 'adiós',
      'thanks': 'gracias', 'please': 'por favor', 'sorry': 'lo siento'
    },
    'es-en': {
      'sí': 'yes', 'no': 'no', 'hola': 'hello', 'adiós': 'bye',
      'gracias': 'thanks', 'por favor': 'please', 'lo siento': 'sorry'
    }
  }
  
  const lookup = words[`${from}-${to}`]
  return lookup?.[text.toLowerCase().trim()] || null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { text, sourceLang, targetLang } = body
    
    // Validation
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ translation: '', error: 'No text provided' }, { status: 400 })
    }
    
    const cleanText = text.trim()
    if (!cleanText) {
      return NextResponse.json({ translation: '' })
    }
    
    // Same language check
    if (sourceLang === targetLang) {
      return NextResponse.json({ translation: cleanText })
    }
    
    // Validate language codes
    const validLangs = ['en', 'es']
    if (!validLangs.includes(sourceLang) || !validLangs.includes(targetLang)) {
      return NextResponse.json({ translation: cleanText, error: 'Invalid language' })
    }

    // Check cache first
    const cacheKey = `${sourceLang}-${targetLang}:${cleanText.toLowerCase()}`
    const cached = cache.get(cacheKey)
    if (cached) {
      return NextResponse.json({ translation: cached, cached: true })
    }

    // Try dictionary lookup first (instant, no API call)
    const langPair = `${sourceLang}-${targetLang}`
    const dictLookup = dict[langPair]?.[cleanText.toLowerCase()]
    if (dictLookup) {
      cache.set(cacheKey, dictLookup)
      return NextResponse.json({ translation: dictLookup, source: 'dictionary' })
    }

    // Try primary API
    let result = await translateMyMemory(cleanText, sourceLang, targetLang)
    
    // Try fallback API
    if (!result) {
      result = await translateHuggingFace(cleanText, sourceLang, targetLang)
    }
    
    // Try simple translation as last resort
    if (!result) {
      result = simpleTranslate(cleanText, sourceLang, targetLang)
    }
    
    // Final fallback: return original text
    const translation = result || cleanText
    
    // Cache successful translations
    if (result) {
      cache.set(cacheKey, translation)
    }
    
    return NextResponse.json({ 
      translation,
      source: result ? 'api' : 'passthrough'
    })
    
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({ 
      translation: '', 
      error: 'Translation failed' 
    }, { status: 500 })
  }
}

// Also support GET for simple testing
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const text = searchParams.get('text')
  const from = searchParams.get('from') || 'en'
  const to = searchParams.get('to') || 'es'
  
  if (!text) {
    return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 })
  }
  
  // Reuse POST logic
  const response = await POST(new NextRequest(req.url, {
    method: 'POST',
    body: JSON.stringify({ text, sourceLang: from, targetLang: to }),
    headers: { 'Content-Type': 'application/json' }
  }))
  
  return response
}
