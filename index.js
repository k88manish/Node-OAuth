// Import the express library
const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
// Import the axios library, to make HTTP requests
const axios = require("axios");
const https = require("https");
const request = require("request");
const fs = require("fs");
const GIT_CONSTS = require("./constants/github");

const JWT_SECRET = "abctestappxyz";
// Create a new express application and use
// the express static middleware, to serve all files
// inside the public directory
const app = express();
app.use(cookieParser());
app.use(express.static(__dirname + "/public"));

app.get("/github/oauth/callback", (req, res) => {
  // The req.query object has the query params that
  // were sent to this route. We want the `code` param
  const requestToken = req.query.code;

  axios({
    // make a POST request
    method: "post",
    // to the Github authentication API, with the client ID, client secret
    // and request token
    url: `${GIT_CONSTS.access_token_url}?client_id=${GIT_CONSTS.clientID}&client_secret=${GIT_CONSTS.clientSecret}&code=${requestToken}`,
    // Set the content type header, so that we get the response in JSOn
    headers: {
      accept: "application/json"
    }
  }).then(response => {
    // Once we get the response, extract the access token from
    // the response body
    const accessToken = response.data.access_token;

    /** This is what ends up in our JWT */
    const payload = {
      accessToken: accessToken,
      expires: Date.now() + 300000
    };

    /** generate a signed json web token and return it in the response */
    const token = jwt.sign(JSON.stringify(payload), JWT_SECRET);
    res.cookie("jwt", token, { httpOnly: true, secure: false });
    // redirect the user to the welcome page, along with the access token
    res.redirect(`/welcome.html`);
  });
});
app.get("/user", (req, res) => {
  const token = req.cookies.jwt;
  if (!token) {
    return res.status(401).send("Missing authentication token");
  }

  try {
    const data = jwt.verify(token, JWT_SECRET);

    axios({
      method: "get",
      url: "https://api.github.com/user",
      headers: {
        Authorization: "token " + data.accessToken
      }
    }).then(response => {
      res.status(200).send(response.data);
    });
  } catch {
    return res.status(401).send("Invalid token");
  }
});

/**
 * Helper function to get the content of the file
 * @param {*} url
 */
const getFileContent = async function(url) {
  return new Promise(resolve => {
    request.get(url, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        resolve(body);
      }
    });
  });
};

/**
 * Helper function to loop in async await manner
 * @param {*} array
 * @param {*} callback
 */
const asyncForEach = async function(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

app.get("/gists/:username", (req, res) => {
  const { username } = req.params;

  if (!username) {
    return res.status(400).send("Username is required");
  }

  axios({
    method: "get",
    url: `https://api.github.com/users/${username}/gists`
  }).then(async response => {
    const { data } = response;
    const transformedData = [];
    await asyncForEach(data, async gistInfo => {
      try {
        const info = { id: gistInfo.id, owner: gistInfo.owner.login, owner_id: gistInfo.owner.id, description: gistInfo.description, files: [] };

        for (let file in gistInfo.files) {
          const fileInfo = gistInfo.files[file];
          const fileContent = await getFileContent(fileInfo.raw_url);
          info.files.push({ name: fileInfo.filename, language: fileInfo.language, content: fileContent });
        }

        transformedData.push(info);
      } catch (error) {
        console.log(error);
      }
    });

    res.status(200).send(transformedData);
  });
});

// Start the server on port 8080
app.listen(8000);
