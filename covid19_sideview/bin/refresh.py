# -*- coding: utf-8 -*-
import csv
import logging
import logging.handlers
import os
import time
import traceback
import zipfile
from subprocess import Popen, PIPE


APP = "covid19_sideview"
SPLUNK_HOME = os.environ["SPLUNK_HOME"]
GITHUB_URL = "https://github.com/CSSEGISandData/COVID-19/archive/master.zip"

LOOKUPS_DIRECTORY = os.path.join(SPLUNK_HOME, "etc", "apps", APP, "lookups")
MERGED_LOOKUP_FILE_NAME = "merged_daily_reports.csv"

FIELDS_TO_NORMALIZE = {
    "Admin2": "County",
    "Country/Region": "Country_Region",
    "Province/State": "Province_State",
    "Last Update": "Last_Update"
}

# unused - this was from an earlier attempt to get the Last_Update field as epochtime
# which went fine, but proved to be just unnecessary. We just get _time from the filename and
# ignore Last_Update now.
#FORMAT_STRINGS_TO_TRY = [
#    "%Y-%m-%d %H:%M:%S",
#    "%m/%d/%y %H:%M",
#    "%m/%d/%Y %H:%M",
#    "%Y-%m-%dT%H:%M:%S"
#]

def setup_logging(log_level):
    """ we use our own log file, although regrettably this is still
    left to be handled by the _internal data input"""
    LOG_FILE_PATH = os.path.join(SPLUNK_HOME, "var", "log", "splunk", APP + ".log")
    LOGGING_FORMAT = "%(asctime)s %(levelname)-s\t%(module)s:%(lineno)d - %(message)s"

    our_logger = logging.getLogger(APP)
    if not our_logger.handlers:
        our_logger.propagate = False
        our_logger.setLevel(log_level)
        handler = logging.handlers.RotatingFileHandler(LOG_FILE_PATH, mode="a")
        handler.setFormatter(logging.Formatter(LOGGING_FORMAT))
        our_logger.addHandler(handler)
    return our_logger

logger = setup_logging(logging.DEBUG)



def download_zip(file_name):
    invocation = ['wget', GITHUB_URL, "--no-check-certificate", "--output-document=" + file_name]
    #print(" ".join(invocation))
    process = Popen(invocation, stdout=PIPE, stderr=PIPE)
    stdout, stderr =process.communicate()
    #if stderr:
    #    print stderr
    #print stdout


def get_new_files_from_github(zip_dir):

    if not os.path.exists(zip_dir):
        os.mkdir(zip_dir)
    os.chdir(zip_dir)

    download_zip("master.zip")

    with zipfile.ZipFile(os.path.join(zip_dir, "master.zip")) as zip_file:
        zip_file.extractall(zip_dir)


def merge_all_daily_reports(zip_dir):
    daily_report_csv_dir = os.path.join(zip_dir,"COVID-19-master", "csse_covid_19_data", "csse_covid_19_daily_reports")

    merged = []
    all_fields = {}
    for root, dirs, csv_files in os.walk(daily_report_csv_dir):
        for file in sorted(csv_files):
            if not file.endswith(".csv"):
                continue


            epochtime = time.mktime(time.strptime(file, "%m-%d-%Y.csv"))

            with open(os.path.join(daily_report_csv_dir, file), 'rb') as f:

                csv_reader = csv.reader(f, delimiter=",")
                first_row = True
                headers = []

                for row in csv_reader:
                    row_dict = {}

                    if first_row:
                        for column in row:
                            # ok... kind of a travesty but seems like the lesser evil rather than
                            # trying to break out encode/decode to deal with the BOM and then have
                            # Python3 issues explode
                            column = column.replace("\xef\xbb\xbf", "")
                            headers.append(column)
                            all_fields[column] = 1
                        first_row = False
                        continue

                    for i in range(len(row)):
                        row_dict[headers[i]] = row[i]
                    row_dict["_time"] = epochtime
                    merged.append(row_dict)


    all_fields["_time"] = 1


    sorted_fields = sorted(all_fields)
    return sorted_fields, merged

def normalize(all_fields, merged):
    for row in merged:
        for key, value in row.items():
            if key in FIELDS_TO_NORMALIZE:
                normalized_key = FIELDS_TO_NORMALIZE[key]
                if normalized_key in row and row[normalized_key]:
                    logger.error("error - both %s and %s were in a single row.", key, normalized_key)
                    #print ("OH NOES")
                    #exit()
                row[normalized_key] = row.get(key, "")
                del row[key]

    #for row in merged:
    #    time_str = row.get("Last_Update")
    #    epochtime = False
    #    for format_str in FORMAT_STRINGS_TO_TRY:
    #        try:
    #            epochtime = time.mktime(time.strptime(time_str, format_str))
    #        except Exception as e:
    #            pass
    #    if epochtime:
    #        row["_time"] = int(epochtime)
    #    else:
    #        print "i give up this didnt match any format string -- %s" % time_str
    #        exit()

    for field, normalized_field in FIELDS_TO_NORMALIZE.items():
        all_fields.remove(field)
        #print(all_fields)
        if normalized_field not in all_fields:
            all_fields.append(normalized_field)
    return all_fields, merged



def write_all_to_single_lookup(all_fields, merged, lookup_file):
    # problems -
    #   the field order is kind of stupid.
    #     Country_Region, Province_State, County, Confirmed,Deaths,Recovered,* would be preferable?
    with open(lookup_file, 'w+') as merged_file:
        aspiring_writer = csv.DictWriter(merged_file, all_fields, delimiter=',')
        aspiring_writer.writeheader()

        for row in merged:
            aspiring_writer.writerow(row)

def _get_csv(url, file_name):
    os.chdir(LOOKUPS_DIRECTORY)
    invocation = ['wget', url, "--no-check-certificate", "--output-document=" + file_name]
    logger.info("using wget to retrieve new data for %s", file_name)
    logger.info(" ".join(invocation))
    process = Popen(invocation, stdout=PIPE, stderr=PIPE)
    stdout, stderr =process.communicate()
    if stderr:
        #print stderr
        logger.warning("error received %s\n", stderr)
    #print stdout


def get_testing_data_for_us_states():
    STATES_URL = "https://covidtracking.com/api/states/daily.csv"
    _get_csv(STATES_URL, "covidtracking_com_states_daily_testing.csv")


def get_lockdown_data():
    LOCKDOWN_URL = "https://covid19-lockdown-tracker.netlify.com/lockdown_dates.csv"
    _get_csv(LOCKDOWN_URL, "netlify_com_lockdown_dates.csv")

if __name__ == '__main__':
    zip_dir = os.path.join(SPLUNK_HOME, "etc", "apps", APP, "git_files")
    try:
        get_new_files_from_github(zip_dir)
    except Exception as e:
        logger.error("we failed to download a new zip from github. Quite possibly this host simply blocks all outbound requests by design. Exiting.")
        logger.error(e)
        logger.error(traceback.format_exc())
        exit()



    try:
        all_fields, merged = merge_all_daily_reports(zip_dir)

        normalized_fields, normalized_merged = normalize(all_fields, merged)
        lookup_file = os.path.join(LOOKUPS_DIRECTORY, MERGED_LOOKUP_FILE_NAME)
        write_all_to_single_lookup(normalized_fields, normalized_merged, lookup_file)
        logger.info("success the lookup %s has been regenerated", MERGED_LOOKUP_FILE_NAME)

    except Exception as e:
        logger.error(e)
        logger.error(traceback.format_exc())
        logger.error("failure the lookup %s was not regenerated", MERGED_LOOKUP_FILE_NAME)

    try:
        get_testing_data_for_us_states()
    except Exception as e:
        logger.error(e)
        logger.error(traceback.format_exc())
        logger.error("failure trying to refresh the testing data for us states from covidtracking.com.")

    try:
        get_lockdown_data()
    except Exception as e:
        logger.error(e)
        logger.error(traceback.format_exc())
        logger.error("failure trying to refresh the data around lockdown dates from netlify.com.")