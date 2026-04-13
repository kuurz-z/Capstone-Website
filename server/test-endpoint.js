import axios from 'axios';

async function test() {
  try {
    // wait for server
    const res = await axios.get('http://localhost:5000/api/users/stats'); // Wait, we probably need an admin auth token.
    console.log(res.data);
  } catch (err) {
    if (err.response) console.log(err.response.data);
    else console.error(err.message);
  }
}
test();