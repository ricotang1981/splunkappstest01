# README for the Sideview Utils app. 

Documentation 
For all documentation see:
https://sideviewapps.com/apps/sideview-utils

Requirements 
  Splunk Enterprise 6.4 or higher
  
  SEARCH HEAD(S)
    This app is to be installed on the Search Head.
    NOTE - In order for your Sideview XML views to have any chance of 
    working and rendering properly in Splunk Enterprise 8 and beyond, you 
    will need to check out and install the Sideview "Canary" app.  
  
  INDEXER(S)
    This app is NOT to be installed on the indexers.

  FORWARDER(S)
    This app is NOT to be installed on any forwarders. 



Splunk Cloud compatibility 
  This app can be installed in Splunk cloud. It has passed Cloud Security 
  vetting and occasionally it even passes all of the AppInspect checks 
  (although the variability depends more on Appinspect than Sideview Utils)

Search Head Cluster Considerations
  None that we know of. Put this on your SHC and it should be fine. 

