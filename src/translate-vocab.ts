// import fs from 'fs'
// import path from 'path'
//
// import request from 'request'
// import uuidv4 from 'uuid/v4'
// import TOML from 'toml-patch'
const fs = require('fs')
const path = require('path')

const request = require('request')
const uuidv4 = require('uuid/v4')
const TOML = require('toml-patch');

const maxInputSize = 10

const merge = function (lists) {
  var merged = []
  for (var idx=0; idx<lists.length; idx++) {
    merged = merged.concat(lists[idx])
  }
  return merged
}

const getEnvVar = function (key) {
  if (!process.env[key]) {
    throw new Error(`Couldn't find environment variable ${key}`)
  }
  return process.env[key]
}

const throttle = function (maxRequests, waitTime) {

  console.debug(`throttle: maxRequests=${maxRequests}, waitTime=${waitTime}`)

  const timeoutPromise = (milliseconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, milliseconds)
    })
  }

  return async function* (promiseFactories) {
    console.debug(`throttle: promiseFactories.length=${promiseFactories.length}`)

    var nBatches = Math.ceil(promiseFactories.length / maxRequests)
    var slice = promiseFactories.slice(0, maxRequests)
    yield slice.map(factory => factory())
    // console.debug('throttle: before loop')
    for (let idx=1; idx<nBatches; idx++) {
      slice = promiseFactories.slice(idx*maxRequests, (idx + 1)*maxRequests)
      // console.debug(`throttle: idx=${idx}`)
      await timeoutPromise(waitTime)
      yield slice.map(factory => factory())
      // yield timeoutPromise(waitTime).then(
      //   () => {return slice.map(factory => factory())})
    }
  }

}


const translateWords = function (subscriptionKey, endPoint) {
  return (words, reqOptions) => {
    if (words.constructor === String) {
      words = [words]
    }

    const createTranslatePromise = (body) => {
      let clientID = uuidv4().toString()
      let options = {
          'method': 'POST',
          'baseUrl': endPoint,
          'url': 'dictionary/lookup',
          'qs': {
            'api-version': '3.0',
            'from': 'en',
            'to': 'hi'
          },
          'headers': {
            'Ocp-Apim-Subscription-Key': subscriptionKey,
            'Content-type': 'application/json',
            'X-ClientTraceId': clientID
          },
          'body': body,
          'json': true,
      }
      if (reqOptions !== undefined) {
        options = Object.assign(options, reqOptions)
      }
      return () => {
        return new Promise((resolve, reject) => {
          request(options, (err, res, content) => {
             if (err) {
               reject (err)
             } else {
               if ('error' in content) {
                 reject (content)
               } else {
                 resolve (content)
               }
             }
          })
        })
      }
    }

    let body = words.map(w => {return {'text': w}})

    if (body.length < maxInputSize) {
      return [createTranslatePromise(body)]
    } else {
      var slice
      var nRequests = Math.ceil(body.length / maxInputSize)
      var promiseFactories = new Array(nRequests)
      for (var idx = 0; idx<nRequests; idx++) {
        slice = body.slice(idx*maxInputSize, (idx + 1)*maxInputSize)
        promiseFactories[idx] = createTranslatePromise(slice)
      }
      return promiseFactories
    }
  }
}

const processLookup = (translationResponse) => {
  return translationResponse['translations'].map((obj) => {
    return obj['normalizedTarget']
    // return {
    //   'target': obj['normalizedTarget'],
    //   'posTag': obj['posTag']
    // }
  })
}

const processTranslation = (translationResponse) => {
  if ('translations' in translationResponse) {
    return translationResponse['translations'].map((sub) => {
      if ('text' in sub) {
        return sub['text']
      } else {
        return ''
      }
    })
  } else {
    return ['']
  }
}

const readVocabList = (filePath) => {
  let contents = fs.readFileSync(filePath, 'utf8')
  return contents
}

const removeCommentary = (word) => {
  var idx = word.indexOf('(')
  if (idx === -1) {
    return word
  } else {
    return word.slice(0, idx)
  }
}


var subscriptionKey = process.env['TRANSLATOR_TEXT_SUBSCRIPTION_KEY']
var endPoint = process.env['TRANSLATOR_TEXT_ENDPOINT']
var curDir = __dirname


async function main () {

  let vocabFilePath = path.join(curDir, 'vocab-625.txt')
  let translationFilePath = path.join(curDir, 'vocab-625.en-hi.toml')
  let contents = readVocabList(vocabFilePath)
  let vocabList = contents.split('\n').filter(w => { return w !== '' && w[0] !== '#' })
  let vocabListNoCommentary = vocabList.map(removeCommentary)
  // console.log(`vocabListNoCommentary.length=${vocabListNoCommentary.length}`)
  const translator = translateWords(subscriptionKey, endPoint)
  const throttler = throttle(5, 200)

  let promiseFactories = translator(vocabListNoCommentary)

  // var res = await Promise.all(promiseFactories.map(factory => factory()))

  var res = []
  for await (var promises of throttler(promiseFactories)) {
    var sub = await Promise.all(promises)
    res = res.concat(
      await Promise.all(promises)
    )
  }

  let merged = merge(res)
  let translations = merged.map(processLookup)
  // console.log(`translations.length=${translations.length}`)

  let retranslateWords = []
  for (var idx = 0; idx<translations.length; idx++) {
    if (translations[idx].length === 0) {
      retranslateWords.push(vocabListNoCommentary[idx])
    }
  }
  console.error(`Failed to initially translate ${retranslateWords.length} words`)

  let retransPromiseFactories = translator(retranslateWords, {'url': 'translate'})
  let retransPromises = retransPromiseFactories.map(factory => factory())

  var resRetranslate = await Promise.all(retransPromises)
  var retranslate = merge(resRetranslate).map(processTranslation)
  let output = new Array(translations.length)

  for (var idx=0; idx<output.length; idx++) {
    var translation = translations[idx]
    if (vocabListNoCommentary[idx] === retranslateWords[0]) {
      retranslateWords.shift()
      translation = retranslate.shift()
    }

    if (translation.length === 0) {
      console.error(`Failed to translate ${vocabListNoCommentary[idx]}`)
    }

    output[idx] = {
      'source': vocabList[idx],
      'target': translation
    }
  }

  fs.writeFileSync(translationFilePath, TOML.stringify(output))
}

main().catch(err => {console.error(err)})
