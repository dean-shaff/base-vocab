const request = require('request');
const uuidv4 = require('uuid/v4');

var key_var = 'TRANSLATOR_TEXT_SUBSCRIPTION_KEY';
if (!process.env[key_var]) {
    throw new Error('Please set/export the following environment variable: ' + key_var);
}
var subscriptionKey = process.env[key_var];
var endpoint_var = 'TRANSLATOR_TEXT_ENDPOINT';
if (!process.env[endpoint_var]) {
    throw new Error('Please set/export the following environment variable: ' + endpoint_var);
}
var endpoint = process.env[endpoint_var];
const clientID = uuidv4().toString()


let options = {
    method: 'POST',
    baseUrl: endpoint,
    url: 'dictionary/lookup',
    qs: {
      'api-version': '3.0',
      'to': 'hi',
      'from': 'en'
    },
    headers: {
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'Content-type': 'application/json',
      'X-ClientTraceId': clientID
    },
    body: [
      { text: 'chair' },
      { text: 'bed' },
      { text: 'dream' },
      { text: 'window' },
      { text: 'door' },
      { text: 'bedroom' },
      { text: 'kitchen' },
      { text: 'bathroom' },
      { text: 'pencil' },
      { text: 'pen' }
    ],
    json: true,
};

const makeRequest = () => {
  return new Promise((resolve, reject) => {
    request(options, (err, res, body) => {
      resolve(body)
    })
  })
}

async function main () {
  var expectedResult = await makeRequest()

  var nPromises = 30
  var promises = new Array(nPromises)

  for (let idx=0; idx<nPromises; idx++) {
    promises[idx] = makeRequest()
  }

  var results = await Promise.all(promises)

  results.forEach((result) => {

    if (JSON.stringify(result) !== JSON.stringify(expectedResult)) {
      console.log(result[0], expectedResult[0])
    }
  })

}


main()
