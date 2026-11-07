"""Create or promote a Cognito administrator without putting credentials in source control."""
import argparse
import getpass
import boto3


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True, help='Admin email and Cognito username')
    parser.add_argument('--name', default='Classflow Admin')
    parser.add_argument('--stack', default='classflow')
    parser.add_argument('--region', default='ap-southeast-2')
    parser.add_argument('--allow-account', required=True)
    args = parser.parse_args()
    password = getpass.getpass('Admin password (minimum 8 characters, lowercase and number): ')
    if len(password) < 8 or not any(c.islower() for c in password) or not any(c.isdigit() for c in password):
        raise SystemExit('Password does not meet the Cognito policy. It was not sent to AWS.')
    session = boto3.Session(region_name=args.region)
    if session.client('sts').get_caller_identity()['Account'] != args.allow_account:
        raise SystemExit('Wrong AWS account. No changes made.')
    outputs = {v['OutputKey']: v['OutputValue'] for v in session.client('cloudformation').describe_stacks(StackName=args.stack)['Stacks'][0]['Outputs']}
    cognito = session.client('cognito-idp')
    try:
        cognito.admin_get_user(UserPoolId=outputs['UserPoolId'], Username=args.email)
    except cognito.exceptions.UserNotFoundException:
        cognito.admin_create_user(UserPoolId=outputs['UserPoolId'], Username=args.email,
            UserAttributes=[{'Name': 'email', 'Value': args.email}, {'Name': 'email_verified', 'Value': 'true'}, {'Name': 'name', 'Value': args.name}],
            MessageAction='SUPPRESS')
    cognito.admin_set_user_password(UserPoolId=outputs['UserPoolId'], Username=args.email, Password=password, Permanent=True)
    cognito.admin_add_user_to_group(UserPoolId=outputs['UserPoolId'], Username=args.email, GroupName='admins')
    print('Admin account is ready:', args.email)


if __name__ == '__main__':
    main()

