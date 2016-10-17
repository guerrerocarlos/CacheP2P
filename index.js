
module.exports = CacheP2P

var WebTorrent = require('webtorrent');
var sha = require('simple-sha1')
var client = new WebTorrent()
var Buffer = require('safe-buffer').Buffer
var debug = require('debug')('all')
var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')




var link_lists = {}
var history_initialized = false

inherits(CacheP2P, EventEmitter)

function CacheP2P(opts){
  var self = this
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

  function onTorrent (torrent) {
    torrent.files.forEach(function (file) {
      file.getBuffer(function (err, b) {
        if (err) return log(err.message)
        // debug(b)
        // debug(b.toString('utf8'))
        var got_page = JSON.parse(b.toString('utf8'))
        // self.emit('message', "Got cached version of "+got_page.url+" from web peer, modifying link to point to cache.")
        
        link_lists[got_page.url].content = got_page.page
        link_lists[got_page.url].title = got_page.title
        link_lists[got_page.url].url = got_page.url
        var link_to_page = link_lists[got_page.url].orig
        self.emit('success', "Got cache for '" +link_to_page.text+"', it will not be requested to the Server when clicked on it.")
        
        link_to_page.onclick = function(event){
          event.preventDefault();
          if(!history_initialized){
            window.history.pushState({page: document.documentElement.innerHTML, title: document.title},"", window.location.href);
          }
          document.documentElement.innerHTML = link_lists[event.target.href].content
          document.title = '* '+link_lists[event.target.href].title
          window.scrollTo(0, 0);
          window.history.pushState({page: got_page.page, title: got_page.title},"", got_page.url);
        }

        window.onpopstate = function(to) {
          document.documentElement.innerHTML = to.state.page
          document.title = '* '+to.state.title
          window.scrollTo(0, 0);

          var this_page_links = document.getElementsByTagName('a')
          for(var i = 0; i < this_page_links.length ; i++){
            if(Object.keys(link_lists).indexOf(this_page_links[i].href) > -1){
              this_page_links[i].onclick = function(event){
                event.preventDefault();
                document.documentElement.innerHTML = link_lists[event.target.href].content
                document.title = '* '+link_lists[event.target.href].title
                window.history.pushState({page: link_lists[event.target.href].content, title: link_lists[event.target.href].title},"", event.target.href);
              }
            }
          }
        }
      })
    })
  }

  setTimeout(function(){
    var this_page_links = document.getElementsByTagName('a')
    
    self.emit('message', "Searching this page for links *://"+document.domain + "/* to optimize.")
    
    for(var i = 0; i < this_page_links.length ; i++){
      if(this_page_links[i].href && this_page_links[i].href.length !== window.location.href.length && this_page_links[i].href.indexOf(window.location.href+'#') == -1 && this_page_links[i].href.indexOf(window.location.href) > -1){
        if(!link_lists[this_page_links[i].href]){
          link_lists[this_page_links[i].href] = {}
        }
        link_lists[this_page_links[i].href].orig = this_page_links[i]
        self.emit('message', "Found '"+this_page_links[i].text + "' link and it's in the same domain, so it can be optimized with CacheP2P.")
        self.emit('message', "Please tell a friend to open this site's "+this_page_links[i].text+" to see CacheP2P in action.")
        
        sha(this_page_links[i].href, function(result){
          
          var magnet = 'magnet:?xt=urn:btih:'+result+'&dn=Unnamed+Torrent+1476541118022&tr=udp%3A%2F%2Fexodus.desync.com%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=wss%3A%2F%2Ftracker.openwebtorrent.com'
          torrent = client.add(magnet, onTorrent)
          torrent.on('done', function (info) {
            self.emit('webtorrent', 'Cache received')
          })
          torrent.on('download', function (bytes) {
            self.emit('webtorrent', 'Receiving ('+bytes+' bytes)')
          })
          torrent.on('wire', function (wire) {
            console.log('wire', wire)
            self.emit('webtorrent', 'Peer '+wire.peerId+' ('+wire.remoteAddress+') is connected over '+wire.type+'.')
          })
        })

      }
    }

    self.emit('message', "Waiting for other people that are browing this same website...")
    

    // var links = document.getElementsByTagName('link')
    // var pageCssCache = ""
    // for(i = 0; i < links.length; i++){
    //   if(links[i].rel.indexOf('stylesheet') > -1){
    //     cssRules = links[i].sheet.cssRules
    //     if(cssRules){
    //       for(r = 0; r < cssRules.length ; r++){
    //           pageCssCache = pageCssCache + cssRules[r].cssText
    //       }
    //     }
    //   }
    // }
    // var styles = document.getElementsByTagName('style')
    // for(i = 0; i < styles.length; i++){
    //     cssRules = styles[i].innerHTML
    //     pageCssCache = pageCssCache + cssRules
    // }
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
        debug('>> url hash:', hash, 'for', message.location_href)
        var torrent = client.seed(buffer_payload,{forced_id: hash, announceList: self.announceList}, function(torrent){
            // add_to_list(torrent, message.location_href)
            debug(torrent.magnetURI)
            torrent.on('upload', function (bytes) {
              self.emit('webtorrent', 'Sending this page to peer ('+bytes+' bytes)')
            })
            torrent.on('wire', function (wire) {
              console.log('wire', wire)
              self.emit('webtorrent', 'Peer '+wire.peerId+' connected ('+wire.remoteAddress+') over '+wire.type+'.')
            })
            // document.title = document.title
        });
      })
    })

  }, 100)
}


document.CacheP2P = new CacheP2P()
client.on('error', function(err){
  document.CacheP2P.emit('webtorrent', err)
})