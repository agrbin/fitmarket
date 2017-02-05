# This token is from the test database on the sandbox instance. Okay to submit.
TOKEN=ba436d9430402s1ava0cu0792579

URL=http://fitmarket.sandbox.xfer.hr/api

# URL=https://fitmarket.xfer.hr/api

if [ $# -eq 1 ]; then
  TOKEN=$1
fi

curl $URL/submit?token=$TOKEN \
  --data "stream_name=SARM&action=sell&count=134"

curl $URL/sell_all?token=$TOKEN \
  --data ""

curl $URL/mystate?token=$TOKEN

