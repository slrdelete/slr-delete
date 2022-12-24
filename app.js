var request = require('request');
request = request.defaults({jar: true});
const cheerio = require('cheerio');
const loginUrl = 'http://www.slrclub.com/login/process.php';
const myArticlesUrl = 'http://www.slrclub.com/mypage/myarticle.php';
const deletePostUrl = 'http://www.slrclub.com/bbs/remove_confirm.php';
const logTarget = document.getElementById('console');

function log(text) {
  const p = document.createElement('p');
  p.appendChild(document.createTextNode(text));
  logTarget.appendChild(p);
  logTarget.scrollTop = logTarget.scrollHeight;
}

async function asyncRequest(options) {
  return new Promise(function(resolve, reject) {
    request(options, function(error, response, body) {
      if (error) {
        reject(error);
      }

      resolve({
        response: response,
        body: body
      });
    });
  });  
}

async function login(url, username, password) {
  const result = await asyncRequest({
    url: url,
    method: 'POST',
    formData: {
      user_id: username,
      password: password,
    },
    headers: {
      'Referer': 'http://www.slrclub.com/bbs/vx2.php?id=ad_free&no=621156',
    },    
  });

  return {
    response: result.response,
    cookie: result.response.headers['set-cookie'].join("; ")
  }
}

async function getMyPostLinks(myArticleUrl) {
  const myPosts = await asyncRequest({url: myArticleUrl});
  const $ = cheerio.load(myPosts.body);
  const myPageLinks = $('#mypage a').toArray();

  const postLinks = myPageLinks.filter((obj) => {
    return obj.attribs && obj.attribs.href.indexOf('/bbs') === 0;
  }).map((obj) => {
    return obj.attribs.href;
  });

  const paginationNumbers = myPageLinks.filter((obj) => {
    return obj.attribs && obj.attribs.href.indexOf('/mypage/myarticle.php?page=') === 0;
  }).map((obj)=> {
    return parseInt(obj.attribs.href.replace('/mypage/myarticle.php?page=', '').replace('&', ''));
  });

  const paginationMin = Math.min.apply(null, paginationNumbers);
  const paginationMax = Math.max.apply(null, paginationNumbers);

  return {
    postLinks: postLinks,
    pagination: {
      min: paginationMin,
      max: paginationMax
    }
  }
}

async function deletePost(deletePostUrl, board, postId) {
  const result = await asyncRequest({
    url: deletePostUrl,
    method: 'POST',
    formData: {
      id: board,
      no: postId,
    },
    headers: {
      'Referer': 'http://www.slrclub.com/bbs/delete.php?id=' + board + '&no=' + postId,
    },        
  });

  return result.response;
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
} 

async function getAllMyPostLinks(myArticlesUrl) {
  const firstPage = await getMyPostLinks(myArticlesUrl);
  const postLinks = firstPage.postLinks;
  log(`글 정보 가져오는 중 1/${firstPage.pagination.max}`);
  for (let i=firstPage.pagination.min; i<=firstPage.pagination.max; i++) {
    log(`글 정보 가져오는 중 ${i}/${firstPage.pagination.max}`);
    const links = await getMyPostLinks(`${myArticlesUrl}?page=${i}`);
    links.postLinks.forEach((obj)=> {
      postLinks.push(obj);
    });
  }

  return postLinks.map((obj)=>{
    const boardAndId = obj.split("vx2.php")[1].split('&');
    
    return {
      board: boardAndId[0].split('?id=')[1],
      id: boardAndId[1].split('no=')[1]
    }
  });
}

async function main(username, password) {
  // Login and save the cookie for the subsquent requests.
  const loginResult = await login(loginUrl, username, password);
  if (loginResult.response.body.indexOf('<script>') === 0) {
    log("잘못된 로그인 정보");
    return;
  }

  document.getElementById('btn-start').disabled = true;

  request.defaults({
    headers: {
      'Cookie': loginResult.cookie
    }
  });

  // Get all the post IDs.
  const myPostIds = await getAllMyPostLinks(myArticlesUrl);
  log(myPostIds.length + "개의 게시글 찾음");
  log("15초에 게시글 하나씩 삭제시작");

  // Loop through the IDs and delete them at 15 secs interval.
  for (let i=0; i<myPostIds.length; i++) {
    const post = myPostIds[i];
    const result = await deletePost(deletePostUrl, post.board, post.id);
    log(`${i+1}/${myPostIds.length} - ${post.board} 에서 ${post.id} 삭제 완료`);
    await sleep(1000 * 15);    
  }
}


// Electron part
const {ipcRenderer } = require('electron');

const form = document.querySelector('#login-form');
document.getElementById('username').focus();
form.addEventListener('submit', function(event) {
  event.preventDefault();
  ipcRenderer.send('login-submitted', {
    username: document.getElementById('username').value,
    password: document.getElementById('password').value
  });
});

ipcRenderer.on('login-submitted', function(event, args) {
  main(args.username, args.password);
});