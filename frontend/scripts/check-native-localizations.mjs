import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const iosRoot = join(frontend, 'ios/App/App')
const usageKeys = ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription']
const errors = []
const fail = message => errors.push(message)

function readIosStrings(locale) {
  const path = join(iosRoot, `${locale}.lproj/InfoPlist.strings`)
  let source
  try { source = readFileSync(path, 'utf8') } catch {
    fail(`Missing iOS ${locale} resource file: ${path}`)
    return new Map()
  }
  const entries = new Map()
  for (const [lineNumber, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const match = line.match(/^\s*("(?:\\.|[^"\\])*")\s*=\s*("(?:\\.|[^"\\])*");\s*$/)
    if (!match) {
      fail(`${locale}: invalid InfoPlist.strings syntax on line ${lineNumber + 1}`)
      continue
    }
    try {
      const key = JSON.parse(match[1])
      const value = JSON.parse(match[2])
      if (entries.has(key)) fail(`${locale}: duplicate iOS key ${key}`)
      entries.set(key, value)
    } catch {
      fail(`${locale}: invalid quoted string on line ${lineNumber + 1}`)
    }
  }
  for (const key of usageKeys) {
    if (!entries.get(key)?.trim()) fail(`${locale}: missing or empty iOS ${key}`)
  }
  if ([...entries.keys()].some(key => !usageKeys.includes(key))) fail(`${locale}: unexpected iOS usage description key`)
  return entries
}

const englishIos = readIosStrings('en')
const russianIos = readIosStrings('ru')
// en.lproj overrides Info.plist on an English phone: it has to say what Info.plist says, or a
// newer wording there (filming a set) never reaches anyone.
const plist = readFileSync(join(iosRoot, 'Info.plist'), 'utf8')
for (const key of usageKeys) {
  const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))
  if (m && englishIos.get(key) !== m[1].replace(/&amp;/g, '&')) fail(`${key}: en.lproj/InfoPlist.strings differs from Info.plist`)
}
for (const key of usageKeys) {
  if (englishIos.get(key) === russianIos.get(key)) fail(`${key}: Russian must have localized copy`)
}

const project = readFileSync(join(frontend, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
for (const locale of ['en', 'ru']) {
  if (!project.includes(`${locale}.lproj/InfoPlist.strings`)) fail(`Xcode project does not include ${locale}.lproj/InfoPlist.strings`)
}
if (/\w+(?:-\w+)?\.lproj\/InfoPlist\.strings/.test(project.replace(/(?:en|ru)\.lproj\/InfoPlist\.strings/g, ''))) {
  fail('Xcode project includes an unexpected localized InfoPlist.strings resource')
}

if (errors.length) {
  console.error(errors.map(error => `✗ ${error}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('iOS usage descriptions cover English and Russian.')
}
