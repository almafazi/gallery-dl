const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const ejs = require('ejs');
const cors = require('cors');
const app = express();
const port = 3111;
const redis = require('ioredis');

require('dotenv').config();

const client = redis.createClient({
    password: process.env.REDIS_PASSWORD
});

app.use(express.json());
app.set('view engine', 'ejs');

app.use(cors());

const cookies_list = ['./cookies/cookies1.txt', './cookies/cookies2.txt'];

function urlencode(str) {
    return encodeURIComponent(str);
}

function urldecode(str) {
    return decodeURIComponent(str);
}

app.get('/dl', async (req, res) => {
    let imgurl = req.query.imgurl;
    let vidurl = req.query.vidurl;
    let fullname = req.query.fullname;

    

    if ((!imgurl && !vidurl) || !fullname) {
        return res.status(400).json({ error: 'Invalid request. Please provide either imgurl or vidurl.' });
    }
    
    if (imgurl) {
        imgurl = decrypt(imgurl);
        const response = await axios.get(imgurl, { responseType: 'stream' });
        res.setHeader('Content-Disposition', 'attachment; filename="'+urldecode(fullname)+'.jpg"');
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } else if (vidurl) {
        vidurl = decrypt(vidurl);
        const response = await axios.get(vidurl, { responseType: 'stream' });
        res.setHeader('Content-Disposition', 'attachment; filename="'+urldecode(fullname)+'.mp4"');
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    }
});

app.get('/pic', async (req, res) => {
    let url = req.query.url;
    
    url = decrypt(url);
    const response = await axios({
        url: url,
        method: 'GET',
        responseType: 'stream'
    });

    return response.data.pipe(res);
});

app.post('/fetch', (req, res) => {
    const { url } = req.body;
    const urlObject = new URL(url);
    urlObject.search = '';
    const urlWithoutQuery = urlObject.toString();
    const proxy = 'http://hwbknjxk-rotate:wcpjh6lq5loy@p.webshare.io:80'; 
    const cookies = cookies_list[Math.floor(Math.random() * cookies_list.length)];

    const command = `./gallery-dl --no-download --dump-json --cookies ${cookies} ${url}`;

    // Check if the result is in the cache
    client.get(urlWithoutQuery, (err, result) => {
        if (result) {
            // If the result is in the cache, parse it and return it
            const jsonOutput = JSON.parse(result);
            renderTemplate(jsonOutput);
        } else {
            // If the result is not in the cache, execute the command
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing gallery-dl: ${error.message}`);
                    return res.status(500).json({ error: 'Internal server error' });
                }
                if (stderr) {
                    console.error(`gallery-dl error: ${stderr}`);
                    return res.status(400).json({ error: 'Invalid request' });
                }

                const jsonOutput = JSON.parse(stdout);

                // Store the result in the cache with an expiration time of 1 hour
                client.set(urlWithoutQuery, stdout, 'EX', 3600);

                renderTemplate(jsonOutput);
            });
        }
    });

    function renderTemplate(jsonOutput) {
        // Render the EJS template to a string
        ejs.renderFile('views/instagram.ejs', { urlencode: urlencode,jsonOutput: jsonOutput, encrypt: encrypt, download_base_url: process.env.DOWNLOAD_BASE_URL, image_base_url: process.env.IMAGE_BASE_URL}, {}, (err, str) => {
            if (err) {
                console.error(`Error rendering EJS template: ${err.message}`);
                return res.status(500).json({ error: 'Internal server error' });
            }

            // Return the rendered HTML in a JSON response
            return res.json({ html: str });
        });
    }
});

function encrypt(text) {
    const key = crypto.scryptSync('encryption key', 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, Buffer.alloc(16));
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decrypt(text) {
    const key = crypto.scryptSync('encryption key', 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.alloc(16));
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

