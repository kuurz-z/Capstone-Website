const http = require('http'); http.get('http://localhost:5000/api/users/stats', (res) = let data = ''; res.on('data', (c) = += c); res.on('end', () =; });  
