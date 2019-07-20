const express = require('express');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = false;
const app = express();
const port = process.env.PORT || 3010;
const fetch = require('node-fetch');
const https = require('https');
const { URLSearchParams } = require('url');
const bodyParser = require('body-parser');
const cors = require('cors');
const proxy = require('http-proxy-middleware');
const navigation = require('../src/navigation.json');
const path = require('path');

const agent = new https.Agent({ rejectUnauthorized: false });

const getCrsfToken = res => (res.headers.get('set-cookie').match(/csrftoken=(\w+);/) || [])[1];
const getSessionId = res => (res.headers.get('set-cookie').match(/sessionid=(\w+);/) || [])[1];

const fetchOptions = { agent, redirect: 'manual' };
const MERCHANT_ID = 'd4ce4ebe635211e8bf29bc764e1107f2';

app.use('/docs',require('./docs'));

const RE_URL = 'https://re.staging.v2.ordergroove.com/';
const authorize = ({ username, password }) =>
  fetch(RE_URL, { ...fetchOptions }).then(res => {
    const csrftoken = getCrsfToken(res);
    const form = new URLSearchParams();
    form.append('csrfmiddlewaretoken', csrftoken);
    form.append('fn', 'auth->login');
    form.append('pn', '');
    form.append('field_name', '');
    form.append('field_value', '');
    form.append('next_page', '/');
    form.append('username', username);
    form.append('password', password);
    form.append('action', 'do');

    const options = {
      ...fetchOptions,
      method: 'POST',
      body: form,
      headers: {
        Cookie: `csrftoken=${csrftoken}`,
        Referer: RE_URL
      }
    };
    return fetch(RE_URL + 'login?', options).then(res => {
      const sessionid = getSessionId(res);
      if (!sessionid) {
        throw Error('unauthorized');
      }

      // TODO hardcode merchant
      const authCookie = `csrftoken=${getCrsfToken(res)}; sessionid=${sessionid}; ogMerchantId=${MERCHANT_ID}`;

      return authCookie;
    });
  });

const queryApi = (authCookie, path) => {
  const options = {
    ...fetchOptions,
    headers: {
      Cookie: authCookie,
      Referer: RE_URL
    }
  };

  return fetch(`${RE_URL}${path}`, options).then(res => res.json());
};

const { isArray, isObject } = require('lodash');

const traverse = (value, iteratee) => {
  if (isArray(value)) {
    value.forEach(it => traverse(it, iteratee));
  } else if (isObject(value) && value.childs) {
    traverse(value.childs, iteratee);
  } else {
    return iteratee(value);
  }
};
const createRedirectMiddleware = app => ({ key }) => {
  if (!key || key === '/') return;
  console.log('Redirect added ', key);

  app.get(key, (req, res) => {
    res.redirect('/?next=' + encodeURI(key));
  });
};

traverse(navigation.mainNav, createRedirectMiddleware(app));
traverse(navigation.secondaryNav, createRedirectMiddleware(app));

// parse application/json
app.use(cors());

// https://github.com/chimurai/http-proxy-middleware/issues/320
app.post('/api/login', bodyParser.json(), async (req, res) => {
  const { username, password } = req.body;
  console.log(`Authorizing ${username}`);
  try {
    const authCookie = await authorize({ username, password });
    const merchants = await queryApi(authCookie, 'reports/merchant/');
    const user = await queryApi(authCookie, 'auth/user/details');

    res.send({
      authCookie,
      merchants,
      user
    });
  } catch (err) {
    res.send({ error: true });
  }
});

app.use(express.static('build'));
app.use('/overrides', express.static(path.resolve('./src/overrides')));

app.get('/cinzano_port.js', (req, res) => res.sendFile(require.resolve('@ordergroove/cinzano')));

require('./msiServerApp')(app);

app.use(express.static(path.dirname(require.resolve('@ordergroove/cinzano'))));

function onProxyRes(proxyRes, req, res) {
  Object.keys(proxyRes.headers).forEach(key => {
    if (key.match(/^(x-|set-cookie|access-|content-security-)/)) {
      delete proxyRes.headers[key];
    }
  });
  // delete proxyRes.headers['set-cookie']; // remove header from response
}

const proxyInstance = proxy({
  target: RE_URL,
  changeOrigin: false,
  secure: false,
  onProxyRes,
  logLevel: 'debug'
});
app.use(proxyInstance);

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
