# README for the Canary app. 

Documentation 
For all documentation see:
https://sideviewapps.com/apps/canary

Requirements 
  Splunk Enterprise 7.0 or higher
  
  SEARCH HEAD(S)
    This app is to be installed on the Search Head.
    To have links to advanced XML pages redirect to the Canary UI on Splunk 8,
    you must also install Sideview Utils version 3.4.9 or higher.
    https://sideviewapps.com/apps/sideview-utils/
    Conversely, if you do not have Sideview Utils 3.4.9 or higher and you are
    running Splunk 8 or higher, users would have to somehow know to manually
    type in the corresponding Canary page URLs into their browser.
  
  INDEXER(S)
    This app is NOT to be installed on the indexers.

  FORWARDER(S)
    This app is NOT to be installed on any forwarders. 



Splunk Cloud compatibility 
  We ultimately intend that this app be Splunk Cloud compatible and we believe
  that it is. 
  However as of this writing it has not yet been vetted by the Cloud 
  Security team. 

Search Head Cluster Considerations
  None that we know of. Put this on your SHC and it should be fine. 

