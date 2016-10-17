
module.exports = CacheP2P

var WebTorrent = require('webtorrent');
var sha = require('simple-sha1')
var client = new WebTorrent()
var Buffer = require('safe-buffer').Buffer
var debug = require('debug')('all')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')


var cached_link_lists = {}
var all_links = []
var added_links = []
var history_initialized = false

inherits(CacheP2P, EventEmitter)

var cached_mark 
function CacheP2P(opts, callback){
  var self = this
  
  if(typeof(opts)==='function'){
    callback = opts
  }
  if(document.security_sha1){
    self.security_sha1 = document.security_sha1
  }
  cached_mark = opts && opts.cached_mark ? opts.cached_mark : "* ";
  if (!(self instanceof CacheP2P)) return new CacheP2P(opts)
  EventEmitter.call(self)
  self.emit("message", "Initializing CacheP2P...")

  window.onpopstate = function(to) {
    console.log('onpopstate called', to)
  }
  self.announceList = [
  [ 'udp://tracker.openbittorrent.com:80' ],
  [ 'udp://tracker.internetwarriors.net:1337' ],
  [ 'udp://tracker.leechers-paradise.org:6969' ],
  [ 'udp://tracker.coppersurfer.tk:6969' ],
  [ 'udp://exodus.desync.com:6969' ],
  [ 'wss://tracker.btorrent.xyz' ],
  [ 'wss://tracker.openwebtorrent.com' ],
  ]
  if(opts && opts.announceList){
    self.announceList = opts.announceList
  }

  self.fetch = function(page_link){
    if(!document.security_sha1 || Object.keys(document.security_sha1).indexOf(page_link.href) > -1){
      if(Object.keys(cached_link_lists).indexOf(page_link.href) === -1){
        self.emit('message', "Pre-fetching '"+page_link.href + "' page from other peers browsing this website...")
        self.emit('alert', "Please tell a friend to open this site's "+page_link.text+" to see it in action.")
        added_links.push(page_link.href)
        sha(page_link.href, function(result){
          
          var magnet = 'magnet:?xt=urn:btih:'+result+'&dn=Unnamed+Torrent+1476541118022&tr=udp%3A%2F%2Fexodus.desync.com%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
          torrent = client.add(magnet, onTorrent)

          torrent.on('done', function (info) {
            self.emit('webtorrent', 'Cache received')
          })
          torrent.on('download', function (bytes) {
            self.emit('webtorrent', 'Receiving Cache ('+bytes+' bytes)')
          })
          torrent.on('wire', function (wire) {
            self.emit('webtorrent', 'Peer ('+wire.remoteAddress+') connected over '+wire.type+' (Connection ID: '+wire.peerId.substr(0,10)+').')
          })
        })
      }
    } 
  }
  self.scan_links = function(){
    self.emit('message', "Pre-fetching uncached links in this page... ")
    var this_page_links = document.getElementsByTagName('a')    
    for(var i = 0; i < this_page_links.length ; i++){
      if(this_page_links[i].href && this_page_links[i].href.length !== window.location.href.length && this_page_links[i].href.indexOf(window.location.href+'#') == -1 && this_page_links[i].href.indexOf(document.domain) > -1){
        if(!document.security_sha1 || Object.keys(document.security_sha1).indexOf(this_page_links[i].href) > -1){
          if(Object.keys(cached_link_lists).indexOf(this_page_links[i].href) === -1){
            self.fetch(this_page_links[i])
          }
        } 
      }
    }
    self.update_links()
  }

  self.update_links = function(){
    var all_links = document.getElementsByTagName('a') 
    
    Object.keys(cached_link_lists).forEach(function(each_url){
      var got_page = cached_link_lists[each_url]
      for(var i = 0 ; i < all_links.length ; i++ ){
        if(all_links[i].href === got_page.url){
          console.log('found link that points to url', each_url)
          var link_to_page = all_links[i]
          self.emit('alert', "Checking sha1 of content received: "+sha.sync(got_page.page)+"...")
          self.emit('success', "Got this site's '" +all_links[i].text+"' in Cache (sha1: "+got_page.page_hash+" ✔)")
          self.emit('success', "The main server will not be used when '"+link_to_page.text+"' is clicked.")
          
          link_to_page.onclick = function(event){
            event.preventDefault();
            if(!history_initialized){
              window.history.pushState({page: document.documentElement.innerHTML, title: document.title},"", window.location.href);
            }
            document.documentElement.innerHTML = cached_link_lists[event.target.href].page
            document.title = cached_mark+' '+cached_link_lists[event.target.href].title
            // setTimeout(function(){
            //   window.scrollTo(0, 0);
              
            // }, 10)
            self.emit('cache', event)
            self.emit('ready')
            self.scan_links()
            
            window.history.pushState({page: got_page.page, title: got_page.title},"", got_page.url);
          }
        }
      }
    })
  }  

  function onTorrent (torrent) {
    torrent.files.forEach(function (file) {
      file.getBuffer(function (err, b) {
        if (err) return log(err.message)
        // debug(b)
        // debug(b.toString('utf8'))
        var got_page = JSON.parse(b.toString('utf8'))
        // self.emit('message', "Got cached version of "+got_page.url+" from web peer, modifying link to point to cache.")
        
        cached_link_lists[got_page.url] = got_page
        self.update_links()

        window.onpopstate = function(to) {
          document.documentElement.innerHTML = to.state.page
          document.title = cached_mark+" "+to.state.title
          window.scrollTo(0, 0);
          self.emit('onpopstate', to)
          
          var this_page_links = document.getElementsByTagName('a')
          for(var i = 0; i < this_page_links.length ; i++){
            if(Object.keys(cached_link_lists).indexOf(this_page_links[i].href) > -1){
              this_page_links[i].onclick = function(event){
                event.preventDefault();
                document.documentElement.innerHTML = cached_link_lists[event.target.href].page
                document.title = cached_mark+' '+cached_link_lists[event.target.href].title
                window.history.pushState({page: cached_link_lists[event.target.href].page, title: cached_link_lists[event.target.href].title},"", event.target.href);
                setTimeout(function(){
                  window.scrollTo(0, 0);
                }, 10)
              }
            } else {
              self.fetch(this_page_links[i])
            }
          }
        }
      })
    })
  }

  setTimeout(function(){
    
    self.emit('message', "Initializing CacheP2P")
    
    self.scan_links()

    var message = {
      location_href: window.location.href.split('#')[0],
      content: document.documentElement.innerHTML,
      // css:  pageCssCache,
      command: 'page_loaded',
    }

    var mergedPage = message.content
    //mergedPage = mergedPage // + '<style type="text/css">'+message.css+'</style>'
    sha(message.location_href, function (hash) {
      sha(mergedPage, function (page_hash) {
        var payload = {date: new Date(), page: mergedPage, page_hash: page_hash, url: message.location_href, title: document.title}
        var buffer_payload = Buffer.from(JSON.stringify(payload), 'utf8')
        self.emit('ready')
        console.log('[CacheP2P] this page\'s security hash:',page_hash,'('+message.location_href+')')
        var torrent = client.seed(buffer_payload,{forced_id: hash, announceList: self.announceList}, function(torrent){
            // add_to_list(torrent, message.location_href)
            debug(torrent.magnetURI)
            cached_link_lists[message.location_href] = payload

            torrent.on('upload', function (bytes) {
              self.emit('webtorrent', 'Sending this page to peer ('+bytes+' bytes)')
            })
            torrent.on('wire', function (wire) {
              self.emit('webtorrent', 'Peer ('+wire.remoteAddress+') connected over '+wire.type+' (Connection ID: '+wire.peerId.substr(0,10)+').')
            })
            // document.title = document.title
        });
      })
    })

  }, 100)
}


// document.CacheP2P = new CacheP2P()
// client.on('error', function(err){
//   document.CacheP2P.emit('webtorrent', err)
// })