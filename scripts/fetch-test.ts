import https from 'https';

const req = https.get('https://www.mahakim.ma', (res) => {
  console.log('Status:', res.statusCode);
});
req.on('error', console.error);
