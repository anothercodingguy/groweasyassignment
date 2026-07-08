fetch('https://registry.npmjs.org/@babel/runtime')
  .then(res => {
    console.log('Status:', res.status);
    return res.json();
  })
  .then(data => {
    console.log('Name:', data.name);
  })
  .catch(err => {
    console.error('Error:', err);
  });
