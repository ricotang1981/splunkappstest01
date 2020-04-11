# README for Sideview's Covid19 Reporting app.

Documentation
For latest documentation see:
https://sideviewapps.com/apps/covid19-reporting/

Requirements
  Splunk Enterprise 7.3 or higher

  SEARCH HEAD(S)
    This app is to be installed on the Search Head.
    Sideview Utils app is required. See app.conf for the required minimum version.
    Canary app is required. See app.conf for the required minimum version.

  INDEXER(S)
    This app is NOT to be installed on the indexers.

  FORWARDER(S)
    This app is NOT to be installed on any forwarders.



Splunk Cloud compatibility
  The app can be deployed on Splunk Cloud in our opinion, although we do not know whether or not
  it has been Cloud-vetted.

Search Head Cluster Considerations
  There aren't any. Put this on your SHC and it'll be fine.
