const WebTorrent = require('webtorrent');
const sha = require('simple-sha1');
const Buffer = require('safe-buffer').Buffer;
const debug = require('debug')('all');
const EventEmitter = require('events').EventEmitter;
const inherits = require('inherits');

const client = new WebTorrent();

const cachedLinkLists = {};
const addedHashes = [];

let cachedMark;
function CacheP2P(opts) {
  const self = this;
  if (document.security_sha1) {
    self.security_sha1 = document.security_sha1;
  }
  cachedMark = opts && opts.cachedMark ? opts.cachedMark : '* ';
  if (!(self instanceof CacheP2P)) return new CacheP2P(opts);
  EventEmitter.call(self);
  self.emit('message', 'Initializing CacheP2P...');

  window.onpopstate = function onpopstate(to) {
    // eslint-disable-next-line no-console
    console.log('onpopstate called', to);
  };
  self.announceList = [
    ['udp://tracker.openbittorrent.com:80'],
    ['udp://tracker.internetwarriors.net:1337'],
    ['udp://tracker.leechers-paradise.org:6969'],
    ['udp://tracker.coppersurfer.tk:6969'],
    ['udp://exodus.desync.com:6969'],
    ['wss://tracker.btorrent.xyz'],
    ['wss://tracker.openwebtorrent.com'],
  ];
  if (opts && opts.announceList) {
    self.announceList = opts.announceList;
  }

  function onTorrent(torrent) {
    torrent.files.forEach((file) => {
      file.getBuffer((err, b) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.log(err.message);
          return;
        }
        // debug(b)
        // debug(b.toString('utf8'))
        const gotPage = JSON.parse(b.toString('utf8'));
        // eslint-disable-next-line max-len
        // self.emit('message', "Got cached version of "+gotPage.url+" from web peer, checking security hash.")

        sha(gotPage.page, (pageHash) => {
          if (pageHash !== self.security_sha1[gotPage.url]) {
            self.emit('message', `Cached version of ${gotPage.url} received, has wrong security hash, rejecting it.`);
            return;
          }

          self.emit('message', `Cached version of ${gotPage.url} has a verified security hash! Proceeding by changing links in page.`);
          cachedLinkLists[gotPage.url] = gotPage;
          self.updateLinks();

          window.onpopstate = function onpopstate(to) {
            document.documentElement.innerHTML = to.state.page;
            document.title = `${cachedMark} ${to.state.title}`;
            window.scrollTo(0, 0);
            self.emit('onpopstate', to);

            function pageLinksOnClick(event) {
              event.preventDefault();
              document.documentElement.innerHTML = cachedLinkLists[event.target.href].page;
              document.title = `${cachedMark} ${cachedLinkLists[event.target.href].title}`;
              window.history.pushState({
                page: cachedLinkLists[event.target.href].page,
                title: cachedLinkLists[event.target.href].title,
              }, '', event.target.href);
              setTimeout(() => {
                window.scrollTo(0, 0);
              }, 10);
            }

            const thisPageLinks = document.getElementsByTagName('a');
            for (let i = 0; i < thisPageLinks.length; i += 1) {
              if (Object.keys(cachedLinkLists).indexOf(thisPageLinks[i].href) > -1) {
                thisPageLinks[i].onclick = pageLinksOnClick;
              } else {
                self.fetch(thisPageLinks[i]);
              }
            }
          };
        });
      });
    });
  }

  self.fetch = function fetch(pageLink) {
    if (!document.security_sha1 || Object.keys(document.security_sha1).includes(pageLink.href)) {
      if (Object.keys(cachedLinkLists).indexOf(pageLink.href) === -1) {
        self.emit('message', `Pre-fetching '${pageLink.href}' page from other peers browsing this website...`);
        self.emit('alert', `Please tell a friend to open this site's ${pageLink.text} to see it in action.`);
        sha(pageLink.href, (result) => {
          if (addedHashes.indexOf(result) === -1) {
            // eslint-disable-next-line max-len
            const magnet = `magnet:?xt=urn:btih:${result}&dn=Unnamed+Torrent+1476541118022&tr=udp%3A%2F%2Fexodus.desync.com%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`;
            const torrent = client.add(magnet, onTorrent);
            addedHashes.push(result);

            torrent.on('done', () => {
              self.emit('webtorrent', 'Cache received');
            });
            torrent.on('download', (bytes) => {
              self.emit('webtorrent', `Receiving Cache (${bytes} bytes)`);
            });
            torrent.on('wire', (wire) => {
              self.emit('webtorrent', `Peer (${wire.remoteAddress}) connected over ${wire.type} (Connection ID: ${wire.peerId.substr(0, 10)}).`);
            });
          }
        });
      }
    }
  };
  self.scan_links = function scanLinks() {
    self.emit('message', 'Pre-fetching uncached links in this page... ');
    const thisPageLinks = document.getElementsByTagName('a');
    for (let i = 0; i < thisPageLinks.length; i += 1) {
      // eslint-disable-next-line max-len
      if (thisPageLinks[i].href && thisPageLinks[i].href.length !== window.location.href.length && thisPageLinks[i].href.indexOf(`${window.location.href}#`) === -1 && thisPageLinks[i].href.indexOf(document.domain) > -1) {
        // eslint-disable-next-line max-len
        if (!document.security_sha1 || Object.keys(document.security_sha1).includes(thisPageLinks[i].href)) {
          if (Object.keys(cachedLinkLists).indexOf(thisPageLinks[i].href) === -1) {
            self.fetch(thisPageLinks[i]);
          }
        }
      }
    }
    self.updateLinks();
  };

  self.updateLinks = function updateLinks() {
    const allLinks = document.getElementsByTagName('a');

    Object.keys(cachedLinkLists).forEach((eachUrl) => {
      const gotPage = cachedLinkLists[eachUrl];
      function linkToPageOnClick(event) {
        event.preventDefault();
        window.history.pushState({
          page: document.documentElement.innerHTML,
          title: document.title,
        }, '', window.location.href);
        document.documentElement.innerHTML = cachedLinkLists[event.target.href].page;
        document.title = `${cachedMark} ${cachedLinkLists[event.target.href].title}`;
        // setTimeout(function(){
        //   window.scrollTo(0, 0);

        // }, 10)
        self.emit('cache', event);
        self.emit('ready');
        self.scan_links();

        window.history.pushState({
          page: gotPage.page,
          title: gotPage.title,
        }, '', gotPage.url);
      }
      for (let i = 0; i < allLinks.length; i += 1) {
        if (allLinks[i].href === gotPage.url) {
          const linkToPage = allLinks[i];
          self.emit('alert', `Security check of content received: ${sha.sync(gotPage.page)}...`);
          // eslint-disable-next-line max-len
          self.emit('success', `Got this site's '${allLinks[i].text}' in Cache (sha1: ${gotPage.pageHash} ✔)`);
          // eslint-disable-next-line max-len
          self.emit('success', `The main server will not be used when '${linkToPage.text}' is clicked.`);
          linkToPage.onclick = linkToPageOnClick;
        }
      }
    });
  };

  setTimeout(() => {
    self.emit('message', 'Initializing CacheP2P');

    self.scan_links();

    const message = {
      location_href: window.location.href.split('#')[0],
      content: document.documentElement.innerHTML,
      // css:  pageCssCache,
      command: 'page_loaded',
    };

    const mergedPage = message.content;
    // mergedPage = mergedPage // + '<style type="text/css">'+message.css+'</style>'
    sha(message.location_href, (hash) => {
      sha(mergedPage, (pageHash) => {
        const payload = {
          date: new Date(),
          page: mergedPage,
          pageHash,
          url: message.location_href,
          title: document.title,
        };
        const bufferPayload = Buffer.from(JSON.stringify(payload), 'utf8');
        self.emit('ready');
        // eslint-disable-next-line no-console
        console.log('[CacheP2P] this page\'s security hash:', pageHash, `(${message.location_href})`);
        client.seed(bufferPayload, {
          forced_id: hash,
          announceList: self.announceList,
        }, (torrent) => {
          // add_to_list(torrent, message.location_href)
          debug(torrent.magnetURI);
          cachedLinkLists[message.location_href] = payload;

          torrent.on('upload', (bytes) => {
            self.emit('webtorrent', `Sending this page to peer (${bytes} bytes)`);
          });
          torrent.on('wire', (wire) => {
            self.emit('webtorrent', `Peer (${wire.remoteAddress}) connected over ${wire.type}.`);
          });
        // document.title = document.title
        });
      });
    });
  }, 100);
}

inherits(CacheP2P, EventEmitter);

module.exports = CacheP2P;

// document.CacheP2P = new CacheP2P()
// client.on('error', function(err){
//   document.CacheP2P.emit('webtorrent', err)
// })
